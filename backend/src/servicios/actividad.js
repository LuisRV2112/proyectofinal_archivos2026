import { Actividad } from '../modelos/index.js';

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
