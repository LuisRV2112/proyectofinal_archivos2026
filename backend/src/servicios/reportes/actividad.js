import { Actividad, Usuario } from '../../modelos/index.js';
import { ErrorValidacion } from '../../utilidades/errores.js';
import { leerBooleano, leerEntero, leerPaginacion, ZONA_HORARIA } from '../../utilidades/consultas.js';
import { rechazarCamposDesconocidos } from '../../utilidades/validacion.js';
import { filtroActividad } from '../actividad.js';
import { leerUsuarioObjetivo } from './comun.js';

// Reportes de actividad (9 a 12). Como el historial es una coleccion
// aparte, agrupar todos los usuarios es un $group directo.
// El 9 es de cualquiera (el propio); 10, 11 y 12 solo del administrador.

const USUARIOS = Usuario.collection.name;

// Formato de la etiqueta de cada periodo. Semana ISO, empieza en lunes.
const PERIODOS = {
  day: '%Y-%m-%d',
  week: '%G-W%V',
  month: '%Y-%m',
  year: '%Y',
};

function leerPeriodo(valor) {
  if (valor === undefined) return 'month';
  const periodo = String(valor).toLowerCase();
  if (!Object.hasOwn(PERIODOS, periodo)) {
    throw new ErrorValidacion(`Período no válido: ${valor}`, 'Usa day, week, month o year');
  }
  return periodo;
}

// Reporte 9: historial de un usuario en un rango de fechas.
export async function historialUsuario(consulta, usuario) {
  rechazarCamposDesconocidos(consulta, ['usuarioId', 'desde', 'hasta', 'accion', 'pagina', 'limite']);
  const objetivo = await leerUsuarioObjetivo(consulta, usuario, 'Solo puedes consultar tu propio historial');
  const filtro = filtroActividad(consulta, { rangoObligatorio: true });
  const { pagina, limite } = leerPaginacion(consulta);

  const [resultado] = await Actividad.aggregate([
    // 1. Usa el indice {usuarioId, fecha}.
    { $match: { ...filtro, usuarioId: objetivo._id } },
    // 2. Mas recientes primero.
    { $sort: { fecha: -1, _id: -1 } },
    // 3. Resumen, total y pagina en una sola pasada.
    {
      $facet: {
        resumen: [
          { $group: { _id: '$accion', cantidad: { $sum: 1 }, ultima: { $max: '$fecha' } } },
          { $sort: { cantidad: -1, _id: 1 } },
          { $project: { _id: 0, accion: '$_id', cantidad: 1, ultima: 1 } },
        ],
        total: [{ $count: 'n' }],
        filas: [
          { $skip: (pagina - 1) * limite },
          { $limit: limite },
          { $project: { usuarioId: 0 } },
        ],
      },
    },
    { $set: { total: { $ifNull: [{ $first: '$total.n' }, 0] } } },
  ]);

  return {
    usuario: objetivo,
    desde: filtro.fecha.$gte ?? null,
    hasta: filtro.fecha.$lte ?? null,
    resumen: resultado.resumen,
    total: resultado.total,
    pagina,
    limite,
    resultados: resultado.filas,
  };
}

// Reporte 10: operaciones por tipo.
export async function operacionesPorTipo(consulta) {
  rechazarCamposDesconocidos(consulta, ['desde', 'hasta', 'recursoTipo']);
  const filtro = filtroActividad(consulta);

  const filas = await Actividad.aggregate([
    // 1. Filtros.
    { $match: filtro },
    // 2. Agrupar por accion y tipo de recurso.
    { $group: { _id: { accion: '$accion', recursoTipo: '$recursoTipo' }, cantidad: { $sum: 1 } } },
    // 3. Agrupar por accion.
    {
      $group: {
        _id: '$_id.accion',
        cantidad: { $sum: '$cantidad' },
        porRecurso: { $push: { recursoTipo: '$_id.recursoTipo', cantidad: '$cantidad' } },
      },
    },
    // 4. Total general con una ventana, para el porcentaje.
    {
      $setWindowFields: {
        sortBy: { cantidad: -1 },
        output: { total: { $sum: '$cantidad', window: { documents: ['unbounded', 'unbounded'] } } },
      },
    },
    {
      $project: {
        _id: 0,
        accion: '$_id',
        cantidad: 1,
        porcentaje: { $round: [{ $multiply: [{ $divide: ['$cantidad', '$total'] }, 100] }, 1] },
        porRecurso: { $sortArray: { input: '$porRecurso', sortBy: { cantidad: -1 } } },
        total: 1,
      },
    },
    // 5. Ordenar.
    { $sort: { cantidad: -1, accion: 1 } },
  ]);

  return {
    desde: filtro.fecha?.$gte ?? null,
    hasta: filtro.fecha?.$lte ?? null,
    total: filas[0]?.total ?? 0,
    acciones: filas.map(({ total, ...fila }) => fila),
  };
}

// Reporte 11: operaciones por periodo (day, week, month o year).
export async function operacionesPorPeriodo(consulta) {
  rechazarCamposDesconocidos(consulta, ['periodo', 'desde', 'hasta', 'accion']);
  const periodo = leerPeriodo(consulta.periodo);
  const filtro = filtroActividad(consulta);

  const filas = await Actividad.aggregate([
    // 1. Filtros.
    { $match: filtro },
    // 2. Inicio del periodo con $dateTrunc, en hora de Guatemala.
    {
      $set: {
        inicio: { $dateTrunc: { date: '$fecha', unit: periodo, timezone: ZONA_HORARIA, startOfWeek: 'monday' } },
      },
    },
    // 3. Agrupar por periodo y accion.
    { $group: { _id: { inicio: '$inicio', accion: '$accion' }, cantidad: { $sum: 1 } } },
    // 4. Agrupar por periodo.
    {
      $group: {
        _id: '$_id.inicio',
        cantidad: { $sum: '$cantidad' },
        porAccion: { $push: { accion: '$_id.accion', cantidad: '$cantidad' } },
      },
    },
    // 5. $densify rellena los periodos sin actividad.
    { $densify: { field: '_id', range: { step: 1, unit: periodo, bounds: 'full' } } },
    // 6. Ordenar por fecha.
    { $sort: { _id: 1 } },
    // 7. Etiqueta y 0 en los rellenados.
    {
      $project: {
        _id: 0,
        etiqueta: { $dateToString: { date: '$_id', format: PERIODOS[periodo], timezone: ZONA_HORARIA } },
        inicio: '$_id',
        cantidad: { $ifNull: ['$cantidad', 0] },
        porAccion: { $sortArray: { input: { $ifNull: ['$porAccion', []] }, sortBy: { cantidad: -1 } } },
      },
    },
  ]);

  return {
    periodo,
    zonaHoraria: ZONA_HORARIA,
    desde: filtro.fecha?.$gte ?? null,
    hasta: filtro.fecha?.$lte ?? null,
    total: filas.reduce((suma, fila) => suma + fila.cantidad, 0),
    periodos: filas,
  };
}

// Reporte 12: principales acciones. A diferencia del 10 es un top N y
// muestra quienes las hacen. excluirSesion quita LOGIN y LOGIN_FALLIDO.
export async function principalesAcciones(consulta) {
  rechazarCamposDesconocidos(consulta, ['limite', 'excluirSesion', 'desde', 'hasta']);
  const limite = leerEntero(consulta.limite, 'limite', { minimo: 1, maximo: 50, defecto: 5 });
  const excluirSesion = leerBooleano(consulta.excluirSesion, 'excluirSesion', false);
  const filtro = filtroActividad(consulta);

  return Actividad.aggregate([
    // 1. Filtros.
    { $match: { ...filtro, ...(excluirSesion && { accion: { $nin: ['LOGIN', 'LOGIN_FALLIDO'] } }) } },
    // 2. Agrupar por accion y usuario.
    {
      $group: {
        _id: { accion: '$accion', usuarioId: '$usuarioId' },
        cantidad: { $sum: 1 },
        ultima: { $max: '$fecha' },
      },
    },
    // 3. Agrupar por accion; $topN guarda los 3 usuarios que mas la hacen.
    {
      $group: {
        _id: '$_id.accion',
        cantidad: { $sum: '$cantidad' },
        usuariosDistintos: { $sum: 1 },
        ultima: { $max: '$ultima' },
        quienesMas: {
          $topN: { n: 3, sortBy: { cantidad: -1, _id: 1 }, output: { usuarioId: '$_id.usuarioId', cantidad: '$cantidad' } },
        },
      },
    },
    // 4. Top N.
    { $sort: { cantidad: -1, _id: 1 } },
    { $limit: limite },
    // 5. Posicion, igual que en el reporte 4.
    { $group: { _id: null, filas: { $push: '$$ROOT' } } },
    { $unwind: { path: '$filas', includeArrayIndex: 'indice' } },
    { $replaceWith: { $mergeObjects: ['$filas', { posicion: { $add: ['$indice', 1] } }] } },
    // 6. Nombres de los usuarios.
    {
      $lookup: {
        from: USUARIOS,
        localField: 'quienesMas.usuarioId',
        foreignField: '_id',
        pipeline: [{ $project: { username: 1, nombreCompleto: 1 } }],
        as: 'usuarios',
      },
    },
    // 7. Unir cada entrada con su usuario.
    {
      $project: {
        _id: 0,
        posicion: 1,
        accion: '$_id',
        cantidad: 1,
        usuariosDistintos: 1,
        ultima: 1,
        quienesMas: {
          $map: {
            input: '$quienesMas',
            as: 'q',
            in: {
              usuario: {
                $ifNull: [{ $first: { $filter: { input: '$usuarios', cond: { $eq: ['$$this._id', '$$q.usuarioId'] } } } }, null],
              },
              cantidad: '$$q.cantidad',
            },
          },
        },
      },
    },
    // $lookup no garantiza el orden.
    { $sort: { posicion: 1 } },
  ]);
}
