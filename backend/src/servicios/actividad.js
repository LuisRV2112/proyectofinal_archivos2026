import { ACCIONES, Actividad, TIPOS_RECURSO, Usuario } from '../modelos/index.js';
import { ErrorProhibido, ErrorValidacion } from '../utilidades/errores.js';
import { etapasPaginacion, leerPaginacion, leerRangoFechas, respuestaPaginada } from '../utilidades/consultas.js';
import { exigirObjectId, rechazarCamposDesconocidos } from '../utilidades/validacion.js';

// Nunca lanza: se llama cuando la operacion ya se hizo, y un error aqui
// devolveria 500 por algo que si ocurrio. Solo se registra en consola.
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

// Filtro del historial y de los reportes de actividad. Un valor invalido da
// 400 en vez de una lista vacia.
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

// El administrador ve todo; el usuario solo el suyo (403 si pide otro).
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
    // Usa {usuarioId, fecha} o {fecha} segun el filtro.
    { $match: filtro },
    { $sort: { fecha: -1, _id: -1 } },
    // $lookup solo sobre la pagina. LOGIN_FALLIDO puede quedar con usuario null.
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
