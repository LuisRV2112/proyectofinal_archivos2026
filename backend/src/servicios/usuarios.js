import bcrypt from 'bcrypt';
import { Usuario, ROLES, CUOTA_MAXIMA, CUOTA_POR_DEFECTO } from '../modelos/index.js';
import { ErrorConflicto, ErrorNoEncontrado, ErrorValidacion } from '../utilidades/errores.js';
import { formatearBytes } from '../utilidades/formato.js';
import { exigirObjectId, exigirObjeto, exigirTexto, rechazarCamposDesconocidos } from '../utilidades/validacion.js';
import { registrarActividad } from './actividad.js';

// Mismo costo que el seed: unas decenas de ms por hash, suficiente para frenar
// un ataque de fuerza bruta sin hacer lento el login.
const COSTO_BCRYPT = 10;
const LONGITUD_MINIMA_PASSWORD = 8;

function validarPassword(password) {
  if (typeof password !== 'string' || password.length < LONGITUD_MINIMA_PASSWORD) {
    throw new ErrorValidacion(`La contraseña debe tener al menos ${LONGITUD_MINIMA_PASSWORD} caracteres`);
  }
}

/** Cuota en bytes: entero entre 0 y CUOTA_MAXIMA. */
function leerCuota(valor) {
  if (!Number.isInteger(valor) || valor < 0 || valor > CUOTA_MAXIMA) {
    throw new ErrorValidacion(
      'La cuota de almacenamiento no es válida',
      `Debe ser un número entero de bytes entre 0 y ${CUOTA_MAXIMA} (${formatearBytes(CUOTA_MAXIMA)})`
    );
  }
  return valor;
}

function validarRol(rol) {
  if (!ROLES.includes(rol)) {
    throw new ErrorValidacion(`Rol no válido: ${rol}`, `Roles aceptados: ${ROLES.join(', ')}`);
  }
}

/**
 * Comprueba antes de guardar que username y email esten libres, para
 * responder 409 con un mensaje claro. El indice unico sigue siendo la garantia
 * real (ver middleware/errores.js) por si dos altas llegan a la vez.
 */
async function validarUnicidad({ username, email }, excluirId = null) {
  const filtroExcluir = excluirId ? { _id: { $ne: excluirId } } : {};
  if (username && (await Usuario.exists({ username, ...filtroExcluir }))) {
    throw new ErrorConflicto('El nombre de usuario ya está en uso', `username: ${username}`);
  }
  if (email && (await Usuario.exists({ email, ...filtroExcluir }))) {
    throw new ErrorConflicto('El correo ya está registrado', `email: ${email}`);
  }
}

async function buscarUsuario(id) {
  const usuario = await Usuario.findById(exigirObjectId(id, 'id de usuario'));
  if (!usuario) throw new ErrorNoEncontrado('Usuario no encontrado');
  return usuario;
}

/** Lista de usuarios, con filtros opcionales ?rol= y ?activo=. */
export async function listarUsuarios(consulta = {}) {
  const filtro = {};
  if (consulta.rol !== undefined) {
    validarRol(consulta.rol);
    filtro.rol = consulta.rol;
  }
  if (consulta.activo !== undefined) {
    if (!['true', 'false'].includes(consulta.activo)) {
      throw new ErrorValidacion('El filtro "activo" debe ser true o false');
    }
    filtro.activo = consulta.activo === 'true';
  }
  // passwordHash no viaja: tiene select:false y ademas toJSON lo quita.
  return Usuario.find(filtro).sort({ username: 1 });
}

export async function crearUsuario(cuerpo, admin) {
  exigirObjeto(cuerpo);
  rechazarCamposDesconocidos(cuerpo, ['username', 'email', 'password', 'nombreCompleto', 'rol', 'cuotaAlmacenamiento']);

  const username = exigirTexto(cuerpo.username, 'username').toLowerCase();
  const email = exigirTexto(cuerpo.email, 'email').toLowerCase();
  const nombreCompleto = exigirTexto(cuerpo.nombreCompleto, 'nombreCompleto');
  const rol = cuerpo.rol ?? 'USUARIO';
  validarRol(rol);
  validarPassword(cuerpo.password);
  const cuotaAlmacenamiento = cuerpo.cuotaAlmacenamiento === undefined ? CUOTA_POR_DEFECTO : leerCuota(cuerpo.cuotaAlmacenamiento);
  await validarUnicidad({ username, email });

  // El resto de reglas de formato (longitud y caracteres del username,
  // formato del correo) las aplica el esquema al guardar; si fallan, el
  // middleware de errores las devuelve como 400.
  const nuevo = await Usuario.create({
    username,
    email,
    nombreCompleto,
    rol,
    cuotaAlmacenamiento,
    passwordHash: await bcrypt.hash(cuerpo.password, COSTO_BCRYPT),
  });

  await registrarActividad({
    usuarioId: admin._id,
    accion: 'CREAR_USUARIO',
    recursoTipo: 'USUARIO',
    recursoId: nuevo._id,
    recursoNombre: nuevo.username,
    detalle: `Creado con rol ${nuevo.rol} y cuota de ${formatearBytes(nuevo.cuotaAlmacenamiento)}`,
  });
  return nuevo;
}

/**
 * Modifica datos de un usuario. El username no se cambia: es el
 * identificador de inicio de sesion y aparece en el historial.
 * `almacenamientoUsado` tampoco: lo calcula el servidor. La cuota si.
 */
export async function actualizarUsuario(id, cuerpo, admin) {
  exigirObjeto(cuerpo);
  rechazarCamposDesconocidos(cuerpo, ['email', 'nombreCompleto', 'rol', 'password', 'cuotaAlmacenamiento']);
  if (Object.keys(cuerpo).length === 0) throw new ErrorValidacion('No se envió ningún campo para modificar');

  const usuario = await buscarUsuario(id);
  const cambios = [];

  if (cuerpo.nombreCompleto !== undefined) {
    usuario.nombreCompleto = exigirTexto(cuerpo.nombreCompleto, 'nombreCompleto');
    cambios.push('nombre');
  }
  if (cuerpo.email !== undefined) {
    const email = exigirTexto(cuerpo.email, 'email').toLowerCase();
    await validarUnicidad({ email }, usuario._id);
    usuario.email = email;
    cambios.push('correo');
  }
  if (cuerpo.rol !== undefined) {
    validarRol(cuerpo.rol);
    // Un administrador no puede quitarse el rol a si mismo: podria dejar el
    // sistema sin nadie capaz de gestionar usuarios.
    if (usuario._id.equals(admin._id) && cuerpo.rol !== 'ADMINISTRADOR') {
      throw new ErrorConflicto('No puedes quitarte el rol de administrador a ti mismo');
    }
    if (cuerpo.rol !== usuario.rol) cambios.push(`rol ${usuario.rol} → ${cuerpo.rol}`);
    usuario.rol = cuerpo.rol;
  }
  if (cuerpo.cuotaAlmacenamiento !== undefined) {
    const cuota = leerCuota(cuerpo.cuotaAlmacenamiento);
    // Bajarla por debajo de lo que ya ocupa dejaria al usuario "excedido" sin
    // forma de saber cuanto debe borrar: se rechaza y se dice cuanto usa.
    if (cuota < usuario.almacenamientoUsado) {
      throw new ErrorConflicto(
        'La cuota no puede ser menor que el espacio que el usuario ya ocupa',
        `Usa ${formatearBytes(usuario.almacenamientoUsado)} (la papelera también cuenta)`
      );
    }
    if (cuota !== usuario.cuotaAlmacenamiento) {
      cambios.push(`cuota ${formatearBytes(usuario.cuotaAlmacenamiento)} → ${formatearBytes(cuota)}`);
    }
    usuario.cuotaAlmacenamiento = cuota;
  }
  if (cuerpo.password !== undefined) {
    validarPassword(cuerpo.password);
    usuario.passwordHash = await bcrypt.hash(cuerpo.password, COSTO_BCRYPT);
    cambios.push('contraseña');
  }

  await usuario.save();
  await registrarActividad({
    usuarioId: admin._id,
    accion: 'MODIFICAR_USUARIO',
    recursoTipo: 'USUARIO',
    recursoId: usuario._id,
    recursoNombre: usuario.username,
    detalle: `Modificado: ${cambios.join(', ') || 'sin cambios'}`,
  });
  return usuario;
}

/**
 * Activa o desactiva una cuenta.
 *
 * Desactivar NO borra nada: sus carpetas, archivos, permisos otorgados y su
 * historial quedan intactos (el historial es auditoria y los reportes deben
 * seguir contandolo). Solo impide iniciar sesion, y como el middleware de
 * autenticacion consulta `activo` en cada peticion, tambien invalida al
 * instante cualquier token que ya tuviera.
 */
export async function cambiarEstadoUsuario(id, cuerpo, admin) {
  exigirObjeto(cuerpo);
  rechazarCamposDesconocidos(cuerpo, ['activo']);
  if (typeof cuerpo.activo !== 'boolean') {
    throw new ErrorValidacion('El campo "activo" es obligatorio y debe ser true o false');
  }

  const usuario = await buscarUsuario(id);
  if (usuario._id.equals(admin._id) && !cuerpo.activo) {
    throw new ErrorConflicto('No puedes desactivar tu propia cuenta');
  }
  // Idempotente: pedir el estado que ya tiene no es un error, pero tampoco
  // es una operacion, asi que no se registra en el historial.
  if (usuario.activo === cuerpo.activo) return usuario;

  usuario.activo = cuerpo.activo;
  await usuario.save();
  await registrarActividad({
    usuarioId: admin._id,
    accion: cuerpo.activo ? 'ACTIVAR_USUARIO' : 'DESACTIVAR_USUARIO',
    recursoTipo: 'USUARIO',
    recursoId: usuario._id,
    recursoNombre: usuario.username,
    detalle: cuerpo.activo ? 'Cuenta activada' : 'Cuenta desactivada; sus documentos e historial se conservan',
  });
  return usuario;
}
