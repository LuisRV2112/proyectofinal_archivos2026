import { Archivo, Carpeta } from '../modelos/index.js';
import { ErrorNoEncontrado, ErrorProhibido, ErrorValidacion } from '../utilidades/errores.js';
import { exigirObjectId, exigirObjeto, exigirTexto, rechazarCamposDesconocidos } from '../utilidades/validacion.js';
import { registrarActividad } from './actividad.js';
import { COLACION_NOMBRES, reubicarSubarbol, ubicacionDentroDe, validarNombreLibre } from './arbol.js';
import { exigirNivel, exigirPropietario } from './permisos.js';

// Los listados excluyen la papelera.
const NO_ELIMINADO = { 'eliminado.estado': false };

// El cliente no necesita el id de GridFS.
const CAMPOS_ARCHIVO_LISTADO = '-gridfsId';

// Una carpeta en la papelera se trata como inexistente.
async function buscarCarpetaActiva(id, campo = 'id de carpeta') {
  const carpeta = await Carpeta.findOne({ _id: exigirObjectId(id, campo), ...NO_ELIMINADO });
  if (!carpeta) throw new ErrorNoEncontrado('Carpeta no encontrada', 'No existe o está en la papelera');
  return carpeta;
}

// Se valida aqui porque bulkWrite no ejecuta los validadores del esquema.
function validarNombre(valor) {
  const nombre = exigirTexto(valor, 'nombre');
  if (nombre === '.' || nombre === '..') throw new ErrorValidacion('Nombre de carpeta no válido');
  const error = new Carpeta({ nombre }).validateSync(['nombre']);
  if (error) throw new ErrorValidacion('Nombre de carpeta no válido', error.errors.nombre.message);
  return nombre;
}

// null = raiz
async function leerDestino(padreId, usuario) {
  if (padreId === null || padreId === undefined) return null;
  const padre = await buscarCarpetaActiva(padreId, 'padreId');
  // Solo en carpetas propias: si no, quedaria contenido de otro propietario
  // dentro de su arbol.
  exigirPropietario(padre, usuario, 'crear o mover elementos dentro de esta carpeta');
  return padre;
}

async function contenidoDe(propietarioId, carpetaId) {
  const [carpetas, archivos] = await Promise.all([
    Carpeta.find({ propietarioId, padreId: carpetaId, ...NO_ELIMINADO }).collation(COLACION_NOMBRES).sort({ nombre: 1 }),
    Archivo.find({ propietarioId, carpetaId, ...NO_ELIMINADO })
      .select(CAMPOS_ARCHIVO_LISTADO)
      .collation(COLACION_NOMBRES)
      .sort({ nombre: 1 }),
  ]);
  return { carpetas, archivos };
}

// GET /api/carpetas/raiz. El administrador puede pasar ?propietarioId.
export async function listarRaiz(usuario, consulta = {}) {
  let propietarioId = usuario._id;
  if (consulta.propietarioId !== undefined) {
    propietarioId = exigirObjectId(consulta.propietarioId, 'propietarioId');
    if (!propietarioId.equals(usuario._id) && usuario.rol !== 'ADMINISTRADOR') {
      throw new ErrorProhibido('Solo un administrador puede consultar la raíz de otro usuario');
    }
  }
  return { propietarioId, ...(await contenidoDe(propietarioId, null)) };
}

// GET /api/carpetas/:id: carpeta, contenido, migas y nivel de acceso.
// Las migas salen de ancestros con una sola consulta por _id.
export async function obtenerCarpeta(id, usuario) {
  const carpeta = await buscarCarpetaActiva(id);
  const acceso = await exigirNivel(carpeta, usuario, 'LECTURA');

  const [ancestros, contenido] = await Promise.all([
    Carpeta.find({ _id: { $in: carpeta.ancestros } }, { nombre: 1, ruta: 1, 'compartidoCon.usuarioId': 1 }).lean(),
    contenidoDe(carpeta.propietarioId, carpeta._id),
  ]);

  // $in no respeta el orden, se reordena segun ancestros.
  const porId = new Map(ancestros.map((a) => [String(a._id), a]));
  let cadena = carpeta.ancestros.map((aid) => porId.get(String(aid))).filter(Boolean);

  // Si entra por un permiso, las migas empiezan en la carpeta compartida.
  if (acceso.via === 'directo' || acceso.via === 'heredado') {
    const primera = cadena.findIndex((a) => a.compartidoCon?.some((p) => p.usuarioId.equals(usuario._id)));
    cadena = primera === -1 ? [] : cadena.slice(primera);
  }
  const migas = [...cadena, carpeta].map(({ _id, nombre, ruta }) => ({ _id, nombre, ruta }));

  return { carpeta, acceso, migas, ...contenido };
}

// POST /api/carpetas
export async function crearCarpeta(cuerpo, usuario) {
  exigirObjeto(cuerpo);
  rechazarCamposDesconocidos(cuerpo, ['nombre', 'padreId']);
  const nombre = validarNombre(cuerpo.nombre);
  const padre = await leerDestino(cuerpo.padreId, usuario);

  await validarNombreLibre(Carpeta, 'padreId', { propietarioId: usuario._id, padreId: padre?._id, nombre });

  const { ancestros, ruta } = ubicacionDentroDe(padre, nombre);
  const carpeta = await Carpeta.create({
    nombre,
    propietarioId: usuario._id,
    padreId: padre?._id ?? null,
    ancestros,
    ruta,
  });

  await registrarActividad({
    usuarioId: usuario._id,
    accion: 'CREAR_CARPETA',
    recursoTipo: 'CARPETA',
    recursoId: carpeta._id,
    recursoNombre: carpeta.nombre,
    detalle: `Creada en ${padre?.ruta ?? 'la raíz'}`,
  });
  return carpeta;
}

// PATCH /api/carpetas/:id. Los ancestros no cambian, pero la ruta del
// subarbol si.
export async function renombrarCarpeta(id, cuerpo, usuario) {
  exigirObjeto(cuerpo);
  rechazarCamposDesconocidos(cuerpo, ['nombre']);
  const nombre = validarNombre(cuerpo.nombre);
  const carpeta = await buscarCarpetaActiva(id);
  await exigirNivel(carpeta, usuario, 'EDICION');

  if (nombre === carpeta.nombre) return { carpeta, reubicados: 0 };
  await validarNombreLibre(Carpeta, 'padreId', {
    propietarioId: carpeta.propietarioId,
    padreId: carpeta.padreId,
    nombre,
    excluirId: carpeta._id,
  });

  const anterior = carpeta.nombre;
  const rutaNueva = carpeta.ruta.slice(0, carpeta.ruta.length - anterior.length) + nombre;
  const reubicados = await reubicarSubarbol(carpeta, {
    padreId: carpeta.padreId,
    ancestrosNuevos: carpeta.ancestros,
    rutaNueva,
    nombreNuevo: nombre,
  });

  await registrarActividad({
    usuarioId: usuario._id,
    accion: 'RENOMBRAR',
    recursoTipo: 'CARPETA',
    recursoId: carpeta._id,
    recursoNombre: nombre,
    detalle: `De "${anterior}" a "${nombre}"`,
  });
  return { carpeta: await Carpeta.findById(carpeta._id), reubicados };
}

// PATCH /api/carpetas/:id/mover
export async function moverCarpeta(id, cuerpo, usuario) {
  exigirObjeto(cuerpo);
  rechazarCamposDesconocidos(cuerpo, ['padreId']);
  if (!('padreId' in cuerpo)) {
    throw new ErrorValidacion('El campo "padreId" es obligatorio', 'Usa null para mover a la raíz');
  }

  const carpeta = await buscarCarpetaActiva(id);
  exigirPropietario(carpeta, usuario, 'mover esta carpeta');
  const destino = await leerDestino(cuerpo.padreId, usuario);

  // Ciclo: el destino es la carpeta o esta dentro de ella.
  if (destino && (destino._id.equals(carpeta._id) || destino.ancestros.some((aid) => aid.equals(carpeta._id)))) {
    throw new ErrorValidacion(
      'No se puede mover una carpeta dentro de sí misma',
      `"${destino.ruta}" está dentro de "${carpeta.ruta}"`
    );
  }

  if (String(carpeta.padreId ?? null) === String(destino?._id ?? null)) return { carpeta, reubicados: 0 };

  await validarNombreLibre(Carpeta, 'padreId', {
    propietarioId: carpeta.propietarioId,
    padreId: destino?._id,
    nombre: carpeta.nombre,
    excluirId: carpeta._id,
  });

  const rutaAnterior = carpeta.ruta;
  const { ancestros: ancestrosNuevos, ruta: rutaNueva } = ubicacionDentroDe(destino, carpeta.nombre);
  const reubicados = await reubicarSubarbol(carpeta, {
    padreId: destino?._id ?? null,
    ancestrosNuevos,
    rutaNueva,
    nombreNuevo: carpeta.nombre,
  });

  await registrarActividad({
    usuarioId: usuario._id,
    accion: 'MOVER',
    recursoTipo: 'CARPETA',
    recursoId: carpeta._id,
    recursoNombre: carpeta.nombre,
    detalle: `De ${rutaAnterior} a ${rutaNueva} (${reubicados} elementos reubicados)`,
  });
  return { carpeta: await Carpeta.findById(carpeta._id), reubicados };
}
