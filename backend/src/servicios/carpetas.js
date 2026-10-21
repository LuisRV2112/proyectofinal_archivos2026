import { Archivo, Carpeta } from '../modelos/index.js';
import { ErrorNoEncontrado, ErrorProhibido, ErrorValidacion } from '../utilidades/errores.js';
import { exigirObjectId, exigirObjeto, exigirTexto, rechazarCamposDesconocidos } from '../utilidades/validacion.js';
import { registrarActividad } from './actividad.js';
import { COLACION_NOMBRES, reubicarSubarbol, ubicacionDentroDe, validarNombreLibre } from './arbol.js';
import { exigirConsulta, exigirPropietario } from './permisos.js';

// Los listados nunca muestran lo que esta en la papelera (regla 5.3). Usa el
// indice {"eliminado.estado": 1}.
const NO_ELIMINADO = { 'eliminado.estado': false };

// El contenido del archivo esta en GridFS; su id es un dato interno que el
// cliente no necesita para navegar (descarga por /api/archivos/:id).
const CAMPOS_ARCHIVO_LISTADO = '-gridfsId';

/**
 * Busca una carpeta que no este en la papelera. Una carpeta eliminada se
 * trata como inexistente (404) en las operaciones normales: solo se gestiona
 * desde la papelera.
 */
async function buscarCarpetaActiva(id, campo = 'id de carpeta') {
  const carpeta = await Carpeta.findOne({ _id: exigirObjectId(id, campo), ...NO_ELIMINADO });
  if (!carpeta) throw new ErrorNoEncontrado('Carpeta no encontrada', 'No existe o está en la papelera');
  return carpeta;
}

/**
 * Normaliza y valida el nombre con las MISMAS reglas del esquema (longitud,
 * sin barras). Hace falta porque mover y renombrar escriben con bulkWrite, que
 * no ejecuta los validadores del esquema.
 */
function validarNombre(valor) {
  const nombre = exigirTexto(valor, 'nombre');
  if (nombre === '.' || nombre === '..') throw new ErrorValidacion('Nombre de carpeta no válido');
  const error = new Carpeta({ nombre }).validateSync(['nombre']);
  if (error) throw new ErrorValidacion('Nombre de carpeta no válido', error.errors.nombre.message);
  return nombre;
}

/** Lee `padreId` del cuerpo: null (o ausente al crear) = raiz del usuario. */
async function leerDestino(padreId, usuario) {
  if (padreId === null || padreId === undefined) return null;
  const padre = await buscarCarpetaActiva(padreId, 'padreId');
  // Solo dentro de carpetas propias: el arbol de cada usuario es suyo. (Con
  // la Fase 5, un permiso de EDICION podria abrir esta puerta.)
  exigirPropietario(padre, usuario, 'crear o mover elementos dentro de esta carpeta');
  return padre;
}

/** Subcarpetas y archivos directos de una ubicacion, ordenados por nombre. */
async function contenidoDe(propietarioId, carpetaId) {
  const [carpetas, archivos] = await Promise.all([
    // Indice {propietarioId: 1, padreId: 1}.
    Carpeta.find({ propietarioId, padreId: carpetaId, ...NO_ELIMINADO }).collation(COLACION_NOMBRES).sort({ nombre: 1 }),
    // Indice {propietarioId: 1, carpetaId: 1}.
    Archivo.find({ propietarioId, carpetaId, ...NO_ELIMINADO })
      .select(CAMPOS_ARCHIVO_LISTADO)
      .collation(COLACION_NOMBRES)
      .sort({ nombre: 1 }),
  ]);
  return { carpetas, archivos };
}

/**
 * GET /api/carpetas/raiz — lo que hay en la raiz del usuario: carpetas con
 * padreId null y archivos con carpetaId null. Se devuelven ambos para que la
 * raiz se navegue igual que cualquier otra carpeta.
 *
 * El administrador puede consultar la raiz de otro usuario con
 * ?propietarioId=.
 */
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

/**
 * GET /api/carpetas/:id — la carpeta, su contenido directo y la ruta de
 * migas.
 *
 * Las migas salen de `ancestros`: ya estan en el documento, ordenados de la
 * raiz hacia abajo, asi que basta UNA consulta por _id (indice _id) para leer
 * sus nombres, sin recorrer el arbol hacia arriba padre por padre.
 */
export async function obtenerCarpeta(id, usuario) {
  const carpeta = await buscarCarpetaActiva(id);
  exigirConsulta(carpeta, usuario);

  const [ancestros, contenido] = await Promise.all([
    Carpeta.find({ _id: { $in: carpeta.ancestros } }, { nombre: 1, ruta: 1 }).lean(),
    contenidoDe(carpeta.propietarioId, carpeta._id),
  ]);

  // $in no respeta el orden del array: se reordena segun `ancestros`.
  const porId = new Map(ancestros.map((a) => [String(a._id), a]));
  const migas = [
    ...carpeta.ancestros.map((aid) => porId.get(String(aid))).filter(Boolean),
    { _id: carpeta._id, nombre: carpeta.nombre, ruta: carpeta.ruta },
  ];

  return { carpeta, migas, ...contenido };
}

/** POST /api/carpetas — { nombre, padreId? } */
export async function crearCarpeta(cuerpo, usuario) {
  exigirObjeto(cuerpo);
  rechazarCamposDesconocidos(cuerpo, ['nombre', 'padreId']);
  const nombre = validarNombre(cuerpo.nombre);
  const padre = await leerDestino(cuerpo.padreId, usuario);

  await validarNombreLibre(Carpeta, 'padreId', { propietarioId: usuario._id, padreId: padre?._id, nombre });

  // ancestros = [...padre.ancestros, padre._id]; ruta = padre.ruta + "/" + nombre
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

/**
 * PATCH /api/carpetas/:id — { nombre }
 *
 * Renombrar no cambia `ancestros` (son ids), pero si la `ruta` de la carpeta
 * y de todas sus subcarpetas ("/Contratos/2026" pasa a "/Legal/2026"), por
 * eso tambien reescribe el subarbol.
 */
export async function renombrarCarpeta(id, cuerpo, usuario) {
  exigirObjeto(cuerpo);
  rechazarCamposDesconocidos(cuerpo, ['nombre']);
  const nombre = validarNombre(cuerpo.nombre);
  const carpeta = await buscarCarpetaActiva(id);
  exigirPropietario(carpeta, usuario, 'renombrar esta carpeta');

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

/**
 * PATCH /api/carpetas/:id/mover — { padreId } (null = a la raiz)
 */
export async function moverCarpeta(id, cuerpo, usuario) {
  exigirObjeto(cuerpo);
  rechazarCamposDesconocidos(cuerpo, ['padreId']);
  if (!('padreId' in cuerpo)) {
    throw new ErrorValidacion('El campo "padreId" es obligatorio', 'Usa null para mover a la raíz');
  }

  const carpeta = await buscarCarpetaActiva(id);
  exigirPropietario(carpeta, usuario, 'mover esta carpeta');
  const destino = await leerDestino(cuerpo.padreId, usuario);

  // Sin ciclos (regla 5.1). Mover A dentro de B es invalido si B es A o si A
  // esta entre los ancestros de B (B es descendiente de A): A acabaria
  // dentro de si misma y el arbol dejaria de serlo. Con Array of Ancestors no
  // hay que recorrer nada: los ancestros de B ya estan en su documento.
  if (destino && (destino._id.equals(carpeta._id) || destino.ancestros.some((aid) => aid.equals(carpeta._id)))) {
    throw new ErrorValidacion(
      'No se puede mover una carpeta dentro de sí misma',
      `"${destino.ruta}" está dentro de "${carpeta.ruta}"`
    );
  }

  // Ya esta ahi: no hay nada que hacer ni que registrar.
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
