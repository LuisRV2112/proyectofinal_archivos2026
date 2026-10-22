import { Actividad, Usuario } from '../../modelos/index.js';
import { ErrorValidacion } from '../../utilidades/errores.js';
import { leerBooleano, leerEntero, leerPaginacion, ZONA_HORARIA } from '../../utilidades/consultas.js';
import { rechazarCamposDesconocidos } from '../../utilidades/validacion.js';
import { filtroActividad } from '../actividad.js';
import { leerUsuarioObjetivo } from './comun.js';

/**
 * Reportes de ACTIVIDAD (9 a 12), todos sobre la coleccion `actividad`.
 *
 * Que el historial sea una coleccion aparte (y no un array embebido en cada
 * usuario) es lo que hace posibles estos reportes: agrupar las operaciones
 * de TODOS los usuarios por accion o por periodo es un $group directo sobre
 * una sola coleccion, apoyado en los indices {accion: 1} y {fecha: -1}.
 *
 * El 9 lo usa cualquiera (su propio historial); el 10, 11 y 12 son del
 * administrador (historial global, seccion 6).
 */

const USUARIOS = Usuario.collection.name;

// Periodo (?periodo) -> unidad de $dateTrunc y formato de la etiqueta.
// La semana se etiqueta como semana ISO (2026-W18), que empieza en lunes,
// igual que el startOfWeek que se le pasa a $dateTrunc.
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

/**
 * Reporte 9 — Historial de actividad de un usuario dentro de un rango de fechas.
 * GET /api/reportes/actividad/historial?desde=&hasta=[&usuarioId=&accion=&pagina=&limite=]
 */
export async function historialUsuario(consulta, usuario) {
  rechazarCamposDesconocidos(consulta, ['usuarioId', 'desde', 'hasta', 'accion', 'pagina', 'limite']);
  const objetivo = await leerUsuarioObjetivo(consulta, usuario, 'Solo puedes consultar tu propio historial');
  const filtro = filtroActividad(consulta, { rangoObligatorio: true });
  const { pagina, limite } = leerPaginacion(consulta);

  const [resultado] = await Actividad.aggregate([
    // 1. Operaciones del usuario en el rango: igualdad en usuarioId y rango
    //    en fecha, justo el orden del indice {usuarioId: 1, fecha: -1}.
    { $match: { ...filtro, usuarioId: objetivo._id } },
    // 2. Lo mas reciente primero (el mismo indice ya entrega este orden).
    { $sort: { fecha: -1, _id: -1 } },
    // 3. Tres resultados sobre los MISMOS documentos en una sola pasada:
    {
      $facet: {
        // 3a. Resumen: cuantas veces hizo cada accion en el periodo.
        resumen: [
          { $group: { _id: '$accion', cantidad: { $sum: 1 }, ultima: { $max: '$fecha' } } },
          { $sort: { cantidad: -1, _id: 1 } },
          { $project: { _id: 0, accion: '$_id', cantidad: 1, ultima: 1 } },
        ],
        // 3b. Total para la paginacion.
        total: [{ $count: 'n' }],
        // 3c. La pagina pedida del detalle.
        filas: [
          { $skip: (pagina - 1) * limite },
          { $limit: limite },
          { $project: { usuarioId: 0 } },
        ],
      },
    },
    // 4. {total: [{n: 37}]} -> {total: 37}
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

/**
 * Reporte 10 — Cantidad de operaciones agrupadas por tipo.
 * GET /api/reportes/actividad/por-tipo[?desde=&hasta=&recursoTipo=]
 */
export async function operacionesPorTipo(consulta) {
  rechazarCamposDesconocidos(consulta, ['desde', 'hasta', 'recursoTipo']);
  const filtro = filtroActividad(consulta);

  const filas = await Actividad.aggregate([
    // 1. Rango y tipo de recurso, si se pidieron.
    { $match: filtro },
    // 2. Primer agrupamiento: por accion Y tipo de recurso (RENOMBRAR y MOVER
    //    aplican a archivos y a carpetas; el desglose muestra cuantas de cada).
    { $group: { _id: { accion: '$accion', recursoTipo: '$recursoTipo' }, cantidad: { $sum: 1 } } },
    // 3. Segundo agrupamiento: por accion, juntando el desglose.
    {
      $group: {
        _id: '$_id.accion',
        cantidad: { $sum: '$cantidad' },
        porRecurso: { $push: { recursoTipo: '$_id.recursoTipo', cantidad: '$cantidad' } },
      },
    },
    // 4. Total general en cada fila (ventana sobre todos los grupos), para
    //    calcular el porcentaje sin una segunda consulta.
    {
      $setWindowFields: {
        sortBy: { cantidad: -1 },
        output: { total: { $sum: '$cantidad', window: { documents: ['unbounded', 'unbounded'] } } },
      },
    },
    // 5. Forma final con el porcentaje de cada accion.
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
    // 6. La accion mas frecuente primero.
    { $sort: { cantidad: -1, accion: 1 } },
  ]);

  return {
    desde: filtro.fecha?.$gte ?? null,
    hasta: filtro.fecha?.$lte ?? null,
    total: filas[0]?.total ?? 0,
    acciones: filas.map(({ total, ...fila }) => fila),
  };
}

/**
 * Reporte 11 — Cantidad de operaciones agrupadas por periodo.
 * GET /api/reportes/actividad/por-periodo?periodo=day|week|month|year[&desde=&hasta=&accion=]
 */
export async function operacionesPorPeriodo(consulta) {
  rechazarCamposDesconocidos(consulta, ['periodo', 'desde', 'hasta', 'accion']);
  const periodo = leerPeriodo(consulta.periodo);
  const filtro = filtroActividad(consulta);

  const filas = await Actividad.aggregate([
    // 1. Rango y accion, si se pidieron.
    { $match: filtro },
    // 2. Cada operacion se lleva al INICIO de su periodo. $dateTrunc recibe la
    //    unidad del parametro y la zona horaria: sin ella, una operacion del
    //    31 de mayo a las 19:00 en Guatemala (01:00 UTC del 1 de junio)
    //    caeria en junio. Las semanas empiezan el lunes.
    {
      $set: {
        inicio: { $dateTrunc: { date: '$fecha', unit: periodo, timezone: ZONA_HORARIA, startOfWeek: 'monday' } },
      },
    },
    // 3. Primer agrupamiento: por periodo Y accion, para el desglose.
    { $group: { _id: { inicio: '$inicio', accion: '$accion' }, cantidad: { $sum: 1 } } },
    // 4. Segundo agrupamiento: por periodo.
    {
      $group: {
        _id: '$_id.inicio',
        cantidad: { $sum: '$cantidad' },
        porAccion: { $push: { accion: '$_id.accion', cantidad: '$cantidad' } },
      },
    },
    // 5. Rellena los periodos sin actividad entre el primero y el ultimo:
    //    sin esto, una serie de tiempo saltaria de marzo a mayo y un grafico
    //    no mostraria el hueco de abril. $densify crea los documentos que
    //    faltan solo con el _id (el inicio del periodo).
    { $densify: { field: '_id', range: { step: 1, unit: periodo, bounds: 'full' } } },
    // 6. Orden cronologico.
    { $sort: { _id: 1 } },
    // 7. Forma final: etiqueta legible en hora local y 0 en los rellenados.
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

/**
 * Reporte 12 — Principales acciones realizadas dentro del sistema.
 * GET /api/reportes/actividad/principales[?limite=5&excluirSesion=true&desde=&hasta=]
 *
 * Se distingue del 10 en que es un ranking (top N) y dice QUIENES realizan
 * cada accion: cuantos usuarios distintos y los que mas la hacen.
 * ?excluirSesion=true deja fuera LOGIN y LOGIN_FALLIDO, que dominan el
 * historial (casi la mitad de las entradas) y no son trabajo con documentos.
 */
export async function principalesAcciones(consulta) {
  rechazarCamposDesconocidos(consulta, ['limite', 'excluirSesion', 'desde', 'hasta']);
  const limite = leerEntero(consulta.limite, 'limite', { minimo: 1, maximo: 50, defecto: 5 });
  const excluirSesion = leerBooleano(consulta.excluirSesion, 'excluirSesion', false);
  const filtro = filtroActividad(consulta);

  return Actividad.aggregate([
    // 1. Rango y, si se pidio, sin las entradas de sesion.
    { $match: { ...filtro, ...(excluirSesion && { accion: { $nin: ['LOGIN', 'LOGIN_FALLIDO'] } }) } },
    // 2. Primer agrupamiento: por accion Y usuario (cuantas hizo cada uno).
    {
      $group: {
        _id: { accion: '$accion', usuarioId: '$usuarioId' },
        cantidad: { $sum: 1 },
        ultima: { $max: '$fecha' },
      },
    },
    // 3. Segundo agrupamiento: por accion. Cada grupo del paso 2 es un
    //    usuario distinto; $topN se queda con los 3 que mas la realizan.
    {
      $group: {
        _id: '$_id.accion',
        cantidad: { $sum: '$cantidad' },
        usuariosDistintos: { $sum: 1 },
        ultima: { $max: '$ultima' },
        quienesMas: {
          $topN: { n: 3, sortBy: { cantidad: -1 }, output: { usuarioId: '$_id.usuarioId', cantidad: '$cantidad' } },
        },
      },
    },
    // 4. Ranking y corte.
    { $sort: { cantidad: -1, _id: 1 } },
    { $limit: limite },
    // 5. Posicion en el ranking, igual que en el reporte 4: las filas YA
    //    ordenadas van a un array y $unwind entrega el indice de cada una.
    //    ($documentNumber volveria a ordenar solo por cantidad y podria
    //    intercambiar dos acciones empatadas.)
    { $group: { _id: null, filas: { $push: '$$ROOT' } } },
    { $unwind: { path: '$filas', includeArrayIndex: 'indice' } },
    { $replaceWith: { $mergeObjects: ['$filas', { posicion: { $add: ['$indice', 1] } }] } },
    // 6. Nombres de los usuarios de quienesMas. Un LOGIN_FALLIDO de un
    //    username inexistente tiene usuarioId null: queda con usuario null.
    {
      $lookup: {
        from: USUARIOS,
        localField: 'quienesMas.usuarioId',
        foreignField: '_id',
        pipeline: [{ $project: { username: 1, nombreCompleto: 1 } }],
        as: 'usuarios',
      },
    },
    // 7. Forma final: cada entrada de quienesMas cruzada con su usuario.
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
    // $lookup no garantiza conservar el orden: se reafirma.
    { $sort: { posicion: 1 } },
  ]);
}
