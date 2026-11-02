import bcrypt from 'bcrypt';
import { Usuario, ROLES, CUOTA_MAXIMA, CUOTA_POR_DEFECTO } from '../modelos/index.js';
import { ErrorConflicto, ErrorNoEncontrado, ErrorValidacion } from '../utilidades/errores.js';
import { formatearBytes } from '../utilidades/formato.js';
import { exigirObjectId, exigirObjeto, exigirTexto, rechazarCamposDesconocidos } from '../utilidades/validacion.js';
import { registrarActividad } from './actividad.js';

// Igual que el seed.
const COSTO_BCRYPT = 10;
const LONGITUD_MINIMA_PASSWORD = 8;

function validarPassword(password) {
  if (typeof password !== 'string' || password.length < LONGITUD_MINIMA_PASSWORD) {
    throw new ErrorValidacion(`La contraseña debe tener al menos ${LONGITUD_MINIMA_PASSWORD} caracteres`);
  }
}

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

// Para responder 409 con un mensaje claro; el indice unico es la garantia real.
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

  // El formato lo valida el esquema.
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

// El username no se cambia: es el login y aparece en el historial.
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
    // Para no quedar sin administradores.
    if (usuario._id.equals(admin._id) && cuerpo.rol !== 'ADMINISTRADOR') {
      throw new ErrorConflicto('No puedes quitarte el rol de administrador a ti mismo');
    }
    if (cuerpo.rol !== usuario.rol) cambios.push(`rol ${usuario.rol} → ${cuerpo.rol}`);
    usuario.rol = cuerpo.rol;
  }
  if (cuerpo.cuotaAlmacenamiento !== undefined) {
    const cuota = leerCuota(cuerpo.cuotaAlmacenamiento);
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

// Desactivar no borra nada, solo impide entrar. Como el middleware revisa
// activo en cada peticion, su token deja de servir de inmediato.
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
  // Si ya tiene ese estado no se registra nada.
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
