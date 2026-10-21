import { Archivo, Carpeta, NIVELES_PERMISO, Usuario } from '../modelos/index.js';
import { ErrorNoEncontrado, ErrorProhibido, ErrorValidacion } from '../utilidades/errores.js';
import { exigirObjectId, exigirObjeto, rechazarCamposDesconocidos } from '../utilidades/validacion.js';
import { registrarActividad } from './actividad.js';
import { esPropietario } from './permisos.js';

/**
 * Comparticion de recursos. Los permisos viven EMBEBIDOS en el propio
 * recurso (`compartidoCon`), asi que compartir, cambiar el nivel y revocar
 * son actualizaciones de un solo documento: atomicas por naturaleza en
 * MongoDB, sin transacciones ni una coleccion intermedia.
 */

// La URL acepta /archivos/:id o /carpetas/:id (y el singular).
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

/**
 * Recurso activo sobre el que `usuario` puede gestionar permisos: solo el
 * PROPIETARIO o un ADMINISTRADOR. Tener EDICION no basta: decidir quien ve un
 * recurso es del dueno, si no, cualquiera con acceso podria re-compartirlo.
 */
async function recursoGestionable(tipo, id, usuario) {
  const { Modelo, recursoTipo, articulo } = leerTipo(tipo);
  const recurso = await Modelo.findOne({ _id: exigirObjectId(id, 'id del recurso'), 'eliminado.estado': false });
  if (!recurso) throw new ErrorNoEncontrado(`${articulo} no existe o está en la papelera`);
  if (!esPropietario(recurso, usuario) && usuario.rol !== 'ADMINISTRADOR') {
    throw new ErrorProhibido('Solo el propietario o un administrador puede gestionar los permisos de este recurso');
  }
  return { Modelo, recursoTipo, recurso };
}

/** Destinatario valido: existe, esta activo, no es quien comparte ni el dueno. */
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

/**
 * GET /api/recursos/:tipo/:id/compartir — con quien esta compartido, con los
 * datos de cada usuario (populate sobre la referencia usuarioId).
 */
export async function listarPermisos(tipo, id, usuario) {
  const { recurso, Modelo } = await recursoGestionable(tipo, id, usuario);
  const conUsuarios = await Modelo.findById(recurso._id, { nombre: 1, compartidoCon: 1 })
    .populate('compartidoCon.usuarioId', CAMPOS_USUARIO)
    .populate('compartidoCon.otorgadoPor', CAMPOS_USUARIO);
  return { recursoId: recurso._id, nombre: recurso.nombre, compartidoCon: conUsuarios.compartidoCon };
}

/**
 * POST /api/recursos/:tipo/:id/compartir — { usuarioId, nivel }
 *
 * Compartir dos veces con el mismo usuario ACTUALIZA el nivel, no duplica la
 * entrada. Se hace con dos actualizaciones condicionales en vez de "leer,
 * modificar el array y guardar", porque asi dos peticiones simultaneas no
 * pueden dejar al usuario repetido en el array:
 *   1. $push solo si el usuario NO esta todavia en compartidoCon
 *   2. si no se agrego, ya estaba: $set del nivel con el operador posicional $
 */
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

  // Ya estaba compartido con el: se trata como un cambio de nivel.
  return { creado: false, ...(await cambiarNivelInterno(Modelo, recursoTipo, recurso, destinatario, nivel, actor)) };
}

async function cambiarNivelInterno(Modelo, recursoTipo, recurso, destinatario, nivel, actor) {
  const anterior = recurso.compartidoCon.find((p) => p.usuarioId.equals(destinatario._id));
  if (!anterior) throw new ErrorNoEncontrado(`El recurso no está compartido con ${destinatario.username}`);
  if (anterior.nivel === nivel) return { permiso: anterior, sinCambios: true };

  // `$` apunta al elemento del array que cumplio 'compartidoCon.usuarioId'.
  // otorgadoPor/otorgadoEn se actualizan: registran quien fijo el nivel
  // vigente y cuando.
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

/** PATCH /api/recursos/:tipo/:id/compartir/:usuarioId — { nivel } */
export async function cambiarNivel(tipo, id, usuarioId, cuerpo, actor) {
  exigirObjeto(cuerpo);
  rechazarCamposDesconocidos(cuerpo, ['nivel']);
  const { Modelo, recursoTipo, recurso } = await recursoGestionable(tipo, id, actor);
  const nivel = leerNivel(cuerpo.nivel);
  const destinatario = await Usuario.findById(exigirObjectId(usuarioId, 'usuarioId'));
  if (!destinatario) throw new ErrorNoEncontrado('Usuario no encontrado');
  return cambiarNivelInterno(Modelo, recursoTipo, recurso, destinatario, nivel, actor);
}

/**
 * DELETE /api/recursos/:tipo/:id/compartir/:usuarioId — revocar.
 *
 * $pull quita la entrada del array. Al revocar el permiso de una carpeta, el
 * usuario pierde tambien el acceso heredado a todo su contenido, sin tocar
 * ningun otro documento: la herencia se calcula al consultar, no se copia.
 */
export async function revocar(tipo, id, usuarioId, actor) {
  const { Modelo, recursoTipo, recurso } = await recursoGestionable(tipo, id, actor);
  const idDestinatario = exigirObjectId(usuarioId, 'usuarioId');
  const anterior = recurso.compartidoCon.find((p) => p.usuarioId.equals(idDestinatario));
  if (!anterior) throw new ErrorNoEncontrado('El recurso no está compartido con ese usuario');

  await Modelo.updateOne({ _id: recurso._id }, { $pull: { compartidoCon: { usuarioId: idDestinatario } } });

  // El usuario puede haberse desactivado; el username es solo para el detalle.
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

/**
 * GET /api/compartidos/conmigo — lo que OTROS compartieron DIRECTAMENTE con el
 * usuario, con su nivel y el propietario. Lo que hay dentro de una carpeta
 * compartida no se repite aqui: se alcanza navegando la carpeta (herencia).
 *
 * Una consulta por coleccion sobre el indice multiclave
 * {"compartidoCon.usuarioId": 1}.
 */
export async function compartidoConmigo(usuario) {
  const filtro = { 'compartidoCon.usuarioId': usuario._id, 'eliminado.estado': false };
  const [carpetas, archivos] = await Promise.all([
    Carpeta.find(filtro).populate('propietarioId', CAMPOS_USUARIO).lean(),
    Archivo.find(filtro, { gridfsId: 0 }).populate('propietarioId', CAMPOS_USUARIO).lean(),
  ]);

  // De todo el array compartidoCon, al usuario solo le importa (y solo debe
  // ver) su propia entrada: no se le muestra con quien mas esta compartido.
  const resumir = (recurso, tipo) => {
    const { compartidoCon, propietarioId, __v, ...resto } = recurso;
    const mio = compartidoCon.find((p) => p.usuarioId.equals(usuario._id));
    return { tipo, ...resto, propietario: propietarioId, nivel: mio.nivel, otorgadoEn: mio.otorgadoEn };
  };
  return [...carpetas.map((c) => resumir(c, 'CARPETA')), ...archivos.map((a) => resumir(a, 'ARCHIVO'))].sort(
    (a, b) => b.otorgadoEn - a.otorgadoEn
  );
}

/**
 * GET /api/compartidos/por-mi — recursos propios con al menos un permiso.
 * `compartidoCon.0` existe solo si el array no esta vacio.
 */
export async function compartidoPorMi(usuario) {
  const filtro = { propietarioId: usuario._id, 'compartidoCon.0': { $exists: true }, 'eliminado.estado': false };
  const [carpetas, archivos] = await Promise.all([
    Carpeta.find(filtro).populate('compartidoCon.usuarioId', CAMPOS_USUARIO).lean(),
    Archivo.find(filtro, { gridfsId: 0 }).populate('compartidoCon.usuarioId', CAMPOS_USUARIO).lean(),
  ]);
  const marcar = (tipo) => ({ __v, ...r }) => ({ tipo, ...r });
  return [...carpetas.map(marcar('CARPETA')), ...archivos.map(marcar('ARCHIVO'))];
}

/**
 * GET /api/compartidos/usuarios — con quien se puede compartir: los usuarios
 * activos salvo uno mismo. Solo datos de identificacion (/api/usuarios, con
 * todos los datos, es exclusivo del administrador).
 */
export async function listarDestinatarios(usuario) {
  return Usuario.find({ activo: true, _id: { $ne: usuario._id } }, CAMPOS_USUARIO).sort({ username: 1 }).lean();
}
