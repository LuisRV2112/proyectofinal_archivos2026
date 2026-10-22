import { ACCIONES, Actividad, TIPOS_RECURSO, Usuario } from '../modelos/index.js';
import { ErrorProhibido, ErrorValidacion } from '../utilidades/errores.js';
import { etapasPaginacion, leerPaginacion, leerRangoFechas, respuestaPaginada } from '../utilidades/consultas.js';
import { exigirObjectId, rechazarCamposDesconocidos } from '../utilidades/validacion.js';

/**
 * Inserta una entrada en el historial (coleccion `actividad`).
 *
 * NUNCA lanza. Se llama despues de que la operacion principal ya se completo
 * (el archivo ya se subio, la carpeta ya se movio): si el registro fallara y
 * el error subiera, el cliente recibiria un 500 por algo que en realidad si
 * ocurrio, y podria reintentarlo y duplicarlo. El historial es secundario
 * respecto de la operacion, asi que un fallo aqui solo se deja en la consola.
 *
 * Por eso tampoco hace falta envolverlo en try/catch al llamarlo; se puede
 * esperar con `await` para que la entrada exista antes de responder (util en
 * las pruebas) sin riesgo de romper nada.
 */
export async function registrarActividad({
  usuarioId = null,
  accion,
  recursoTipo,
  recursoId = null,
  recursoNombre,
  detalle = '',
}) {
  try {
    await Actividad.create({ usuarioId, accion, recursoTipo, recursoId, recursoNombre, detalle, fecha: new Date() });
  } catch (error) {
    console.error(
      `[actividad] No se pudo registrar ${accion} sobre ${recursoTipo} "${recursoNombre}" ` +
        `(usuario ${usuarioId ?? 'desconocido'}): ${error.message}`
    );
  }
}

/**
 * Filtro comun del historial y de los reportes de actividad, a partir de la
 * URL: ?accion, ?recursoTipo, ?recursoId, ?desde, ?hasta. Cada valor se
 * valida antes de llegar al $match (un valor fuera del enum da 400, no una
 * lista vacia que parezca "no hubo actividad").
 */
export function filtroActividad(consulta, { rangoObligatorio = false } = {}) {
  const filtro = {};
  if (consulta.accion !== undefined) {
    const accion = String(consulta.accion).toUpperCase();
    if (!ACCIONES.includes(accion)) throw new ErrorValidacion(`Acción no válida: ${consulta.accion}`, `Valores aceptados: ${ACCIONES.join(', ')}`);
    filtro.accion = accion;
  }
  if (consulta.recursoTipo !== undefined) {
    const tipo = String(consulta.recursoTipo).toUpperCase();
    if (!TIPOS_RECURSO.includes(tipo)) throw new ErrorValidacion(`Tipo de recurso no válido: ${consulta.recursoTipo}`, `Valores aceptados: ${TIPOS_RECURSO.join(', ')}`);
    filtro.recursoTipo = tipo;
  }
  if (consulta.recursoId !== undefined) filtro.recursoId = exigirObjectId(consulta.recursoId, 'recursoId');
  const rango = leerRangoFechas(consulta, { obligatorio: rangoObligatorio });
  if (rango) filtro.fecha = rango;
  return filtro;
}

/**
 * Historial: GET /api/actividad[?usuarioId&accion&recursoTipo&recursoId&desde&hasta&pagina&limite]
 *
 * El administrador ve el de todos (y puede filtrar por usuario); un usuario
 * normal solo el SUYO: su usuarioId se impone en el filtro, y pedir el de
 * otro es un 403 explicito en vez de ignorarse en silencio.
 */
export async function listarActividad(consulta, usuario) {
  rechazarCamposDesconocidos(consulta, ['usuarioId', 'accion', 'recursoTipo', 'recursoId', 'desde', 'hasta', 'pagina', 'limite']);
  const filtro = filtroActividad(consulta);
  const paginacion = leerPaginacion(consulta);

  if (consulta.usuarioId !== undefined) filtro.usuarioId = exigirObjectId(consulta.usuarioId, 'usuarioId');
  if (usuario.rol !== 'ADMINISTRADOR') {
    if (filtro.usuarioId && !filtro.usuarioId.equals(usuario._id)) {
      throw new ErrorProhibido('Solo puedes consultar tu propio historial');
    }
    filtro.usuarioId = usuario._id;
  }

  const resultado = await Actividad.aggregate([
    // 1. Filtros. Con usuarioId usa el indice {usuarioId: 1, fecha: -1}; sin
    //    el, el indice {fecha: -1} (o {accion: 1} si se filtro por accion).
    { $match: filtro },
    // 2. Lo mas reciente primero.
    { $sort: { fecha: -1, _id: -1 } },
    // 3. Total + pagina; el nombre de quien la hizo solo para las filas
    //    devueltas. Un LOGIN_FALLIDO con un username inexistente no tiene
    //    usuarioId: su fila queda con usuario null (el nombre intentado esta
    //    en recursoNombre).
    ...etapasPaginacion(paginacion, [
      {
        $lookup: {
          from: Usuario.collection.name,
          localField: 'usuarioId',
          foreignField: '_id',
          pipeline: [{ $project: { username: 1, nombreCompleto: 1 } }],
          as: 'usuario',
        },
      },
      { $set: { usuario: { $ifNull: [{ $first: '$usuario' }, null] } } },
      { $project: { usuarioId: 0 } },
    ]),
  ]);

  return respuestaPaginada(resultado, paginacion);
}
