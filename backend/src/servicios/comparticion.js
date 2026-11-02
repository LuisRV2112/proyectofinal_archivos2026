import { Archivo, Carpeta, NIVELES_PERMISO, Usuario } from '../modelos/index.js';
import { ErrorNoEncontrado, ErrorProhibido, ErrorValidacion } from '../utilidades/errores.js';
import { exigirObjectId, exigirObjeto, rechazarCamposDesconocidos } from '../utilidades/validacion.js';
import { registrarActividad } from './actividad.js';
import { esPropietario } from './permisos.js';

// Como los permisos estan embebidos, compartir y revocar modifican un solo
// documento: son atomicos sin transacciones.

const TIPOS = {
  archivo: { Modelo: Archivo, recursoTipo: 'ARCHIVO', articulo: 'El archivo' },
  carpeta: { Modelo: Carpeta, recursoTipo: 'CARPETA', articulo: 'La carpeta' },
};
const CAMPOS_USUARIO = 'username nombreCompleto';

function leerTipo(tipo) {
  const clave = String(tipo).toLowerCase().replace(/s$/, '');
  if (!TIPOS[clave]) throw new ErrorValidacion(`Tipo de recurso no válido: ${tipo}`, 'Usa "archivos" o "carpetas"');
  return TIPOS[clave];
}

function leerNivel(nivel) {
  if (!NIVELES_PERMISO.includes(nivel)) {
    throw new ErrorValidacion(`Nivel de permiso no válido: ${nivel}`, `Niveles: ${NIVELES_PERMISO.join(', ')}`);
  }
  return nivel;
}

// Solo el propietario o el administrador; con EDICION no basta.
async function recursoGestionable(tipo, id, usuario) {
  const { Modelo, recursoTipo, articulo } = leerTipo(tipo);
  const recurso = await Modelo.findOne({ _id: exigirObjectId(id, 'id del recurso'), 'eliminado.estado': false });
  if (!recurso) throw new ErrorNoEncontrado(`${articulo} no existe o está en la papelera`);
  if (!esPropietario(recurso, usuario) && usuario.rol !== 'ADMINISTRADOR') {
    throw new ErrorProhibido('Solo el propietario o un administrador puede gestionar los permisos de este recurso');
  }
  return { Modelo, recursoTipo, recurso };
}

async function leerDestinatario(usuarioId, recurso, actor) {
  const id = exigirObjectId(usuarioId, 'usuarioId');
  if (id.equals(actor._id)) throw new ErrorValidacion('No puedes compartir un recurso contigo mismo');
  if (id.equals(recurso.propietarioId)) {
    throw new ErrorValidacion('El propietario ya tiene acceso total a su recurso');
  }
  const destinatario = await Usuario.findById(id);
  if (!destinatario) throw new ErrorNoEncontrado('Usuario destinatario no encontrado');
  if (!destinatario.activo) throw new ErrorValidacion('No se puede compartir con un usuario desactivado');
  return destinatario;
}

// GET /api/recursos/:tipo/:id/compartir
export async function listarPermisos(tipo, id, usuario) {
  const { recurso, Modelo } = await recursoGestionable(tipo, id, usuario);
  const conUsuarios = await Modelo.findById(recurso._id, { nombre: 1, compartidoCon: 1 })
    .populate('compartidoCon.usuarioId', CAMPOS_USUARIO)
    .populate('compartidoCon.otorgadoPor', CAMPOS_USUARIO);
  return { recursoId: recurso._id, nombre: recurso.nombre, compartidoCon: conUsuarios.compartidoCon };
}

// POST /api/recursos/:tipo/:id/compartir
// $push solo si el usuario no esta; si ya estaba se cambia el nivel. Asi dos
// peticiones a la vez no lo duplican.
export async function compartir(tipo, id, cuerpo, actor) {
  exigirObjeto(cuerpo);
  rechazarCamposDesconocidos(cuerpo, ['usuarioId', 'nivel']);
  const { Modelo, recursoTipo, recurso } = await recursoGestionable(tipo, id, actor);
  const nivel = leerNivel(cuerpo.nivel);
  const destinatario = await leerDestinatario(cuerpo.usuarioId, recurso, actor);

  const permiso = { usuarioId: destinatario._id, nivel, otorgadoPor: actor._id, otorgadoEn: new Date() };
  const agregado = await Modelo.updateOne(
    { _id: recurso._id, 'compartidoCon.usuarioId': { $ne: destinatario._id } },
    { $push: { compartidoCon: permiso } }
  );

  if (agregado.modifiedCount === 1) {
    await registrarActividad({
      usuarioId: actor._id,
      accion: 'COMPARTIR',
      recursoTipo,
      recursoId: recurso._id,
      recursoNombre: recurso.nombre,
      detalle: `Compartido con ${destinatario.username} (${nivel})`,
    });
    return { creado: true, permiso };
  }

  return { creado: false, ...(await cambiarNivelInterno(Modelo, recursoTipo, recurso, destinatario, nivel, actor)) };
}

async function cambiarNivelInterno(Modelo, recursoTipo, recurso, destinatario, nivel, actor) {
  const anterior = recurso.compartidoCon.find((p) => p.usuarioId.equals(destinatario._id));
  if (!anterior) throw new ErrorNoEncontrado(`El recurso no está compartido con ${destinatario.username}`);
  if (anterior.nivel === nivel) return { permiso: anterior, sinCambios: true };

  // $ es el elemento que coincidio con el filtro.
  const ahora = new Date();
  await Modelo.updateOne(
    { _id: recurso._id, 'compartidoCon.usuarioId': destinatario._id },
    {
      $set: {
        'compartidoCon.$.nivel': nivel,
        'compartidoCon.$.otorgadoPor': actor._id,
        'compartidoCon.$.otorgadoEn': ahora,
      },
    }
  );
  await registrarActividad({
    usuarioId: actor._id,
    accion: 'MODIFICAR_PERMISO',
    recursoTipo,
    recursoId: recurso._id,
    recursoNombre: recurso.nombre,
    detalle: `${destinatario.username}: ${anterior.nivel} → ${nivel}`,
  });
  return { permiso: { usuarioId: destinatario._id, nivel, otorgadoPor: actor._id, otorgadoEn: ahora } };
}

// PATCH /api/recursos/:tipo/:id/compartir/:usuarioId
export async function cambiarNivel(tipo, id, usuarioId, cuerpo, actor) {
  exigirObjeto(cuerpo);
  rechazarCamposDesconocidos(cuerpo, ['nivel']);
  const { Modelo, recursoTipo, recurso } = await recursoGestionable(tipo, id, actor);
  const nivel = leerNivel(cuerpo.nivel);
  const destinatario = await Usuario.findById(exigirObjectId(usuarioId, 'usuarioId'));
  if (!destinatario) throw new ErrorNoEncontrado('Usuario no encontrado');
  return cambiarNivelInterno(Modelo, recursoTipo, recurso, destinatario, nivel, actor);
}

// DELETE /api/recursos/:tipo/:id/compartir/:usuarioId
// La herencia no se copia, asi que revocar la carpeta quita el acceso a
// todo su contenido.
export async function revocar(tipo, id, usuarioId, actor) {
  const { Modelo, recursoTipo, recurso } = await recursoGestionable(tipo, id, actor);
  const idDestinatario = exigirObjectId(usuarioId, 'usuarioId');
  const anterior = recurso.compartidoCon.find((p) => p.usuarioId.equals(idDestinatario));
  if (!anterior) throw new ErrorNoEncontrado('El recurso no está compartido con ese usuario');

  await Modelo.updateOne({ _id: recurso._id }, { $pull: { compartidoCon: { usuarioId: idDestinatario } } });

  const destinatario = await Usuario.findById(idDestinatario, { username: 1 });
  await registrarActividad({
    usuarioId: actor._id,
    accion: 'REVOCAR',
    recursoTipo,
    recursoId: recurso._id,
    recursoNombre: recurso.nombre,
    detalle: `Revocado a ${destinatario?.username ?? idDestinatario} (tenía ${anterior.nivel})`,
  });
  return { revocado: true };
}

// GET /api/compartidos/conmigo. Solo lo compartido directo; el contenido
// de las carpetas se ve navegando.
export async function compartidoConmigo(usuario) {
  const filtro = { 'compartidoCon.usuarioId': usuario._id, 'eliminado.estado': false };
  const [carpetas, archivos] = await Promise.all([
    Carpeta.find(filtro).populate('propietarioId', CAMPOS_USUARIO).lean(),
    Archivo.find(filtro, { gridfsId: 0 }).populate('propietarioId', CAMPOS_USUARIO).lean(),
  ]);

  // Solo se le muestra su propio permiso.
  const resumir = (recurso, tipo) => {
    const { compartidoCon, propietarioId, __v, ...resto } = recurso;
    const mio = compartidoCon.find((p) => p.usuarioId.equals(usuario._id));
    return { tipo, ...resto, propietario: propietarioId, nivel: mio.nivel, otorgadoEn: mio.otorgadoEn };
  };
  return [...carpetas.map((c) => resumir(c, 'CARPETA')), ...archivos.map((a) => resumir(a, 'ARCHIVO'))].sort(
    (a, b) => b.otorgadoEn - a.otorgadoEn
  );
}

// GET /api/compartidos/por-mi. compartidoCon.0 existe si el array no esta vacio.
export async function compartidoPorMi(usuario) {
  const filtro = { propietarioId: usuario._id, 'compartidoCon.0': { $exists: true }, 'eliminado.estado': false };
  const [carpetas, archivos] = await Promise.all([
    Carpeta.find(filtro).populate('compartidoCon.usuarioId', CAMPOS_USUARIO).lean(),
    Archivo.find(filtro, { gridfsId: 0 }).populate('compartidoCon.usuarioId', CAMPOS_USUARIO).lean(),
  ]);
  const marcar = (tipo) => ({ __v, ...r }) => ({ tipo, ...r });
  return [...carpetas.map(marcar('CARPETA')), ...archivos.map(marcar('ARCHIVO'))];
}

// GET /api/compartidos/usuarios. Usuarios activos, solo nombre y username.
export async function listarDestinatarios(usuario) {
  return Usuario.find({ activo: true, _id: { $ne: usuario._id } }, CAMPOS_USUARIO).sort({ username: 1 }).lean();
}
