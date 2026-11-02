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

// Reportes de archivos (1, 2, 3 y 14). Solo administrador.
// Incluyen la papelera porque sigue ocupando espacio; ?incluirPapelera=false la excluye.

const USUARIOS = Usuario.collection.name;
const CARPETAS = Carpeta.collection.name;
const ARCHIVOS = Archivo.collection.name;

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

// propietarioId -> { username, nombreCompleto } con $lookup + $unwind.
export function etapasPropietario(campo = 'propietarioId', destino = 'propietario') {
  return [
    {
      $lookup: {
        from: USUARIOS,
        localField: campo,
        foreignField: '_id',
        pipeline: [{ $project: { username: 1, nombreCompleto: 1 } }],
        as: destino,
      },
    },
    { $unwind: { path: `$${destino}`, preserveNullAndEmptyArrays: true } },
  ];
}

// Reporte 1: archivos por tipo.
export async function archivosPorTipo(consulta) {
  rechazarCamposDesconocidos(consulta, ['incluirPapelera']);

  const filas = await Archivo.aggregate([
    // 1. Con o sin papelera.
    { $match: filtroPapelera(consulta) },
    // 2. Agrupar por extension.
    {
      $group: {
        _id: '$extension',
        cantidad: { $sum: 1 },
        enPapelera: { $sum: { $cond: ['$eliminado.estado', 1, 0] } },
        bytes: { $sum: '$tamano' },
        tamanoPromedio: { $avg: '$tamano' },
      },
    },
    // 3. Total general en cada fila con una ventana sobre todos los grupos.
    {
      $setWindowFields: {
        sortBy: { cantidad: -1 },
        output: { total: { $sum: '$cantidad', window: { documents: ['unbounded', 'unbounded'] } } },
      },
    },
    // 4. Porcentaje de cada tipo.
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
    // 5. Ordenar.
    { $sort: { cantidad: -1 } },
  ]);

  return { total: filas[0]?.total ?? 0, tipos: filas.map(({ total, ...fila }) => fila) };
}

// Reporte 2: archivos en un rango de fechas.
export async function archivosPorFecha(consulta) {
  rechazarCamposDesconocidos(consulta, ['desde', 'hasta', 'extension', 'incluirPapelera', 'pagina', 'limite']);
  const rango = leerRangoFechas(consulta, { obligatorio: true });
  const extension = leerExtension(consulta.extension);
  const paginacion = leerPaginacion(consulta);

  const resultado = await Archivo.aggregate([
    // 1. Rango de creadoEn (indice) y filtros.
    { $match: { creadoEn: rango, ...(extension && { extension }), ...filtroPapelera(consulta) } },
    // 2. Mas recientes primero.
    { $sort: { creadoEn: -1 } },
    // 3. Paginar; los $lookup solo sobre la pagina.
    ...etapasPaginacion(paginacion, [
      ...etapasPropietario(),
      // Ruta de la carpeta.
      {
        $lookup: {
          from: CARPETAS,
          localField: 'carpetaId',
          foreignField: '_id',
          pipeline: [{ $project: { ruta: 1 } }],
          as: 'carpeta',
        },
      },
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

// Reporte 3: archivos con mas operaciones.
// Parte de actividad: se agrupa una vez y solo el top se cruza con archivos.
// Asi salen tambien los eliminados, gracias a recursoNombre.
export async function archivosConMasOperaciones(consulta) {
  rechazarCamposDesconocidos(consulta, ['limite', 'desde', 'hasta']);
  const limite = leerEntero(consulta.limite, 'limite', { minimo: 1, maximo: 100, defecto: 10 });
  const rango = leerRangoFechas(consulta);

  return Actividad.aggregate([
    // 1. Operaciones sobre archivos.
    { $match: { recursoTipo: 'ARCHIVO', ...(rango && { fecha: rango }) } },
    // 2. Agrupar por archivo y accion.
    {
      $group: {
        _id: { archivo: '$recursoId', accion: '$accion' },
        cantidad: { $sum: 1 },
        ultima: { $max: '$fecha' },
        nombre: { $top: { sortBy: { fecha: -1 }, output: '$recursoNombre' } },
      },
    },
    // 3. Agrupar por archivo con el desglose por accion.
    {
      $group: {
        _id: '$_id.archivo',
        operaciones: { $sum: '$cantidad' },
        porAccion: { $push: { accion: '$_id.accion', cantidad: '$cantidad' } },
        ultimaOperacion: { $max: '$ultima' },
        nombreEnHistorial: { $top: { sortBy: { ultima: -1 }, output: '$nombre' } },
      },
    },
    // 4. Top N.
    { $sort: { operaciones: -1, ultimaOperacion: -1 } },
    { $limit: limite },
    // 5. Datos actuales del archivo, si existe.
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
    // 6. existe: false = eliminado definitivamente.
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
        porAccion: { $sortArray: { input: '$porAccion', sortBy: { cantidad: -1 } } },
      },
    },
  ]);
}

// Reporte 14: carpetas con mas archivos, directos o en todo el subarbol.
// Por defecto directos; si no, las carpetas raiz siempre ganarian.
// El $lookup por ancestros trae el subarbol usando el indice.
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
    // 1. Carpetas activas.
    { $match: filtro },
    // 2. Contar los archivos del subarbol dentro del $lookup.
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
    // 3. Sin archivos = 0.
    {
      $set: {
        archivosDirectos: { $ifNull: [{ $first: '$conteo.directos' }, 0] },
        archivosSubarbol: { $ifNull: [{ $first: '$conteo.subarbol' }, 0] },
        bytesDirectos: { $ifNull: [{ $first: '$conteo.bytesDirectos' }, 0] },
        bytesSubarbol: { $ifNull: [{ $first: '$conteo.bytesSubarbol' }, 0] },
      },
    },
    // 4. Quitar las vacias.
    { $match: { [campoOrden]: { $gt: 0 } } },
    // 5. Top N.
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
        nivel: { $add: [{ $size: '$ancestros' }, 1] },
      },
    },
  ]);
}
