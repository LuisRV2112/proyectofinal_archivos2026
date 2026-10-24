import { Actividad, Archivo, Carpeta, EXTENSIONES_PERMITIDAS, Usuario } from '../../modelos/index.js';
import { ErrorValidacion } from '../../utilidades/errores.js';
import {
  etapasPaginacion,
  leerBooleano,
  leerEntero,
  leerPaginacion,
  leerRangoFechas,
  respuestaPaginada,
} from '../../utilidades/consultas.js';
import { exigirObjectId, rechazarCamposDesconocidos } from '../../utilidades/validacion.js';

/**
 * Reportes de ARCHIVOS Y ALMACENAMIENTO (1 a 3, y 14). Solo administrador.
 *
 * Todos se resuelven con aggregation pipeline: el agrupamiento, los conteos
 * y los cruces con otras colecciones ($lookup) los hace MongoDB, y a Node
 * solo llega el resultado ya resumido.
 *
 * Por defecto cuentan tambien lo que esta en la papelera: esos archivos
 * siguen almacenados y ocupando espacio (regla 5.4). Con
 * ?incluirPapelera=false se limitan a los activos.
 */

const USUARIOS = Usuario.collection.name;
const CARPETAS = Carpeta.collection.name;
const ARCHIVOS = Archivo.collection.name;

/** $match inicial segun ?incluirPapelera (true por defecto). */
function filtroPapelera(consulta) {
  return leerBooleano(consulta.incluirPapelera, 'incluirPapelera', true) ? {} : { 'eliminado.estado': false };
}

function leerExtension(valor) {
  if (valor === undefined) return null;
  const extension = String(valor).toLowerCase().replace(/^\./, '');
  if (!EXTENSIONES_PERMITIDAS.includes(extension)) {
    throw new ErrorValidacion(`Extensión no válida: ${valor}`, `Valores aceptados: ${EXTENSIONES_PERMITIDAS.join(', ')}`);
  }
  return extension;
}

/**
 * Etapas que reemplazan propietarioId por {_id, username, nombreCompleto}.
 * $lookup es el "join" de MongoDB: busca en `usuarios` el documento cuyo _id
 * coincide (indice _id) y lo deja en un array, que $unwind aplana.
 */
export function etapasPropietario(campo = 'propietarioId', destino = 'propietario') {
  return [
    {
      $lookup: {
        from: USUARIOS,
        localField: campo,
        foreignField: '_id',
        // Solo lo necesario: nunca viaja el passwordHash.
        pipeline: [{ $project: { username: 1, nombreCompleto: 1 } }],
        as: destino,
      },
    },
    // preserveNull: si el usuario no existiera, la fila se conserva con null.
    { $unwind: { path: `$${destino}`, preserveNullAndEmptyArrays: true } },
  ];
}

/**
 * Reporte 1 — Cantidad de archivos agrupados por tipo.
 * GET /api/reportes/archivos/por-tipo[?incluirPapelera=false]
 */
export async function archivosPorTipo(consulta) {
  rechazarCamposDesconocidos(consulta, ['incluirPapelera']);

  const filas = await Archivo.aggregate([
    // 1. Que archivos entran (todos, o solo los activos).
    { $match: filtroPapelera(consulta) },
    // 2. Un grupo por extension: cuantos hay, cuantos en papelera, bytes.
    {
      $group: {
        _id: '$extension',
        cantidad: { $sum: 1 },
        enPapelera: { $sum: { $cond: ['$eliminado.estado', 1, 0] } },
        bytes: { $sum: '$tamano' },
        tamanoPromedio: { $avg: '$tamano' },
      },
    },
    // 3. Total general en cada fila, sin otra consulta: una "ventana" que
    //    abarca todas las filas suma las cantidades de todos los grupos.
    {
      $setWindowFields: {
        sortBy: { cantidad: -1 },
        output: { total: { $sum: '$cantidad', window: { documents: ['unbounded', 'unbounded'] } } },
      },
    },
    // 4. Forma final, con el porcentaje de cada tipo sobre el total.
    {
      $project: {
        _id: 0,
        extension: '$_id',
        cantidad: 1,
        activos: { $subtract: ['$cantidad', '$enPapelera'] },
        enPapelera: 1,
        bytes: 1,
        tamanoPromedio: { $round: ['$tamanoPromedio', 0] },
        porcentaje: { $round: [{ $multiply: [{ $divide: ['$cantidad', '$total'] }, 100] }, 1] },
        total: 1,
      },
    },
    // 5. Primero el tipo mas frecuente.
    { $sort: { cantidad: -1 } },
  ]);

  return { total: filas[0]?.total ?? 0, tipos: filas.map(({ total, ...fila }) => fila) };
}

/**
 * Reporte 2 — Archivos almacenados dentro de un rango de fechas.
 * GET /api/reportes/archivos/por-fecha?desde=2026-05-01&hasta=2026-05-31
 *     [&extension=md&incluirPapelera=false&pagina=1&limite=50]
 */
export async function archivosPorFecha(consulta) {
  rechazarCamposDesconocidos(consulta, ['desde', 'hasta', 'extension', 'incluirPapelera', 'pagina', 'limite']);
  const rango = leerRangoFechas(consulta, { obligatorio: true });
  const extension = leerExtension(consulta.extension);
  const paginacion = leerPaginacion(consulta);

  const resultado = await Archivo.aggregate([
    // 1. Rango sobre la fecha de subida (indice {creadoEn: -1}) y filtros.
    { $match: { creadoEn: rango, ...(extension && { extension }), ...filtroPapelera(consulta) } },
    // 2. Del mas reciente al mas antiguo (el mismo indice sirve para ordenar).
    { $sort: { creadoEn: -1 } },
    // 3. Total y pagina en una sola pasada. Los $lookup van dentro, sobre la
    //    pagina ya cortada.
    ...etapasPaginacion(paginacion, [
      // 3a. Propietario: username y nombre en vez de un ObjectId.
      ...etapasPropietario(),
      // 3b. Ruta legible de la carpeta en que esta.
      {
        $lookup: {
          from: CARPETAS,
          localField: 'carpetaId',
          foreignField: '_id',
          pipeline: [{ $project: { ruta: 1 } }],
          as: 'carpeta',
        },
      },
      // 3c. Forma de cada fila.
      {
        $project: {
          nombre: 1,
          extension: 1,
          tamano: 1,
          creadoEn: 1,
          ubicacion: { $ifNull: [{ $first: '$carpeta.ruta' }, '/'] },
          enPapelera: '$eliminado.estado',
          propietario: 1,
        },
      },
    ]),
  ]);

  return { desde: rango.$gte ?? null, hasta: rango.$lte ?? null, ...respuestaPaginada(resultado, paginacion) };
}

/**
 * Reporte 3 — Archivos con mayor cantidad de operaciones registradas.
 * GET /api/reportes/archivos/mas-operaciones[?limite=10&desde=&hasta=]
 *
 * Se parte de `actividad` y no de `archivos` (con un $lookup a actividad por
 * cada archivo): agrupar el historial por recursoId recorre cada entrada una
 * sola vez, y solo los N ganadores se cruzan despues con `archivos`. Ademas
 * asi aparecen tambien archivos ya eliminados definitivamente, cuyo nombre se
 * conserva en `recursoNombre` (denormalizado justamente para esto).
 */
export async function archivosConMasOperaciones(consulta) {
  rechazarCamposDesconocidos(consulta, ['limite', 'desde', 'hasta']);
  const limite = leerEntero(consulta.limite, 'limite', { minimo: 1, maximo: 100, defecto: 10 });
  const rango = leerRangoFechas(consulta);

  return Actividad.aggregate([
    // 1. Solo operaciones sobre archivos (y en el rango, si se pidio).
    { $match: { recursoTipo: 'ARCHIVO', ...(rango && { fecha: rango }) } },
    // 2. Primer agrupamiento: por archivo Y accion, para el desglose.
    {
      $group: {
        _id: { archivo: '$recursoId', accion: '$accion' },
        cantidad: { $sum: 1 },
        ultima: { $max: '$fecha' },
        // El nombre de la entrada mas reciente de este grupo.
        nombre: { $top: { sortBy: { fecha: -1 }, output: '$recursoNombre' } },
      },
    },
    // 3. Segundo agrupamiento: por archivo, juntando el desglose por accion.
    {
      $group: {
        _id: '$_id.archivo',
        operaciones: { $sum: '$cantidad' },
        porAccion: { $push: { accion: '$_id.accion', cantidad: '$cantidad' } },
        ultimaOperacion: { $max: '$ultima' },
        nombreEnHistorial: { $top: { sortBy: { ultima: -1 }, output: '$nombre' } },
      },
    },
    // 4. Los de mas operaciones primero; desempate por actividad mas reciente.
    { $sort: { operaciones: -1, ultimaOperacion: -1 } },
    { $limit: limite },
    // 5. Datos actuales del archivo, si todavia existe.
    {
      $lookup: {
        from: ARCHIVOS,
        localField: '_id',
        foreignField: '_id',
        pipeline: [{ $project: { nombre: 1, extension: 1, propietarioId: 1, 'eliminado.estado': 1 } }],
        as: 'archivo',
      },
    },
    { $unwind: { path: '$archivo', preserveNullAndEmptyArrays: true } },
    ...etapasPropietario('archivo.propietarioId', 'propietario'),
    // 6. Forma final. `existe: false` = eliminado definitivamente.
    {
      $project: {
        _id: 0,
        archivoId: '$_id',
        nombre: { $ifNull: ['$archivo.nombre', '$nombreEnHistorial'] },
        extension: '$archivo.extension',
        existe: { $toBool: { $ifNull: ['$archivo._id', false] } },
        enPapelera: { $ifNull: ['$archivo.eliminado.estado', false] },
        propietario: 1,
        operaciones: 1,
        ultimaOperacion: 1,
        // El desglose, de la accion mas frecuente a la menos.
        porAccion: { $sortArray: { input: '$porAccion', sortBy: { cantidad: -1 } } },
      },
    },
  ]);
}

/**
 * Reporte 14 — Carpetas con mayor cantidad de archivos.
 * GET /api/reportes/archivos/carpetas-mas-archivos[?contar=directos|subarbol&usuarioId=&limite=10]
 *
 * Cuenta dos cosas por carpeta: los archivos que estan DIRECTAMENTE en ella
 * y los de TODO su subarbol (subcarpetas incluidas). `?contar` elige por cual
 * se ordena; por defecto, los directos (si no, las carpetas raiz ganarian
 * siempre, porque su subarbol lo contiene todo).
 *
 * Array of Ancestors en accion: un archivo esta en el subarbol de C si C
 * aparece en su `ancestros`. El $lookup con localField `_id` y foreignField
 * `ancestros` busca exactamente eso, usando el indice {ancestros: 1}, y en la
 * misma pasada distingue los directos (carpetaId = C). Sin el array habria
 * que recorrer el arbol hacia abajo carpeta por carpeta.
 *
 * Los archivos en la papelera no cuentan: ya no estan "en" la carpeta.
 */
export async function carpetasConMasArchivos(consulta) {
  rechazarCamposDesconocidos(consulta, ['contar', 'usuarioId', 'limite']);
  const limite = leerEntero(consulta.limite, 'limite', { minimo: 1, maximo: 100, defecto: 10 });
  const contar = consulta.contar ?? 'directos';
  if (!['directos', 'subarbol'].includes(contar)) {
    throw new ErrorValidacion(`Valor de "contar" no válido: ${contar}`, 'Usa directos o subarbol');
  }
  const filtro = { 'eliminado.estado': false };
  if (consulta.usuarioId !== undefined) filtro.propietarioId = exigirObjectId(consulta.usuarioId, 'usuarioId');

  const campoOrden = contar === 'directos' ? 'archivosDirectos' : 'archivosSubarbol';
  return Carpeta.aggregate([
    // 1. Carpetas activas (de un usuario, si se pidio).
    { $match: filtro },
    // 2. Archivos activos de su subarbol, ya resumidos dentro del $lookup:
    //    a la etapa siguiente llega un solo documento con los totales, no la
    //    lista de archivos.
    {
      $lookup: {
        from: ARCHIVOS,
        localField: '_id',
        foreignField: 'ancestros',
        let: { carpeta: '$_id' },
        pipeline: [
          { $match: { 'eliminado.estado': false } },
          {
            $group: {
              _id: null,
              subarbol: { $sum: 1 },
              directos: { $sum: { $cond: [{ $eq: ['$carpetaId', '$$carpeta'] }, 1, 0] } },
              bytesDirectos: { $sum: { $cond: [{ $eq: ['$carpetaId', '$$carpeta'] }, '$tamano', 0] } },
              bytesSubarbol: { $sum: '$tamano' },
            },
          },
        ],
        as: 'conteo',
      },
    },
    // 3. Aplana el conteo; una carpeta sin archivos queda en 0.
    {
      $set: {
        archivosDirectos: { $ifNull: [{ $first: '$conteo.directos' }, 0] },
        archivosSubarbol: { $ifNull: [{ $first: '$conteo.subarbol' }, 0] },
        bytesDirectos: { $ifNull: [{ $first: '$conteo.bytesDirectos' }, 0] },
        bytesSubarbol: { $ifNull: [{ $first: '$conteo.bytesSubarbol' }, 0] },
      },
    },
    // 4. Solo carpetas con al menos un archivo segun el criterio elegido.
    { $match: { [campoOrden]: { $gt: 0 } } },
    // 5. Las de mas archivos primero; desempate por el otro conteo y la ruta.
    { $sort: { [campoOrden]: -1, archivosSubarbol: -1, ruta: 1 } },
    { $limit: limite },
    ...etapasPropietario(),
    {
      $project: {
        nombre: 1,
        ruta: 1,
        propietario: 1,
        archivosDirectos: 1,
        archivosSubarbol: 1,
        bytesDirectos: 1,
        bytesSubarbol: 1,
        // Profundidad = cuantas carpetas tiene por encima.
        nivel: { $add: [{ $size: '$ancestros' }, 1] },
      },
    },
  ]);
}
