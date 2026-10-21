import mongoose from 'mongoose';
import { ErrorApi, ErrorNoEncontrado } from '../utilidades/errores.js';

/** Cualquier ruta que no exista bajo /api responde 404 en el mismo formato. */
export function rutaNoEncontrada(req, _res, next) {
  next(new ErrorNoEncontrado('Ruta no encontrada', `${req.method} ${req.originalUrl}`));
}

/**
 * Traduce errores que no son de la API (Mongoose, driver, body-parser) a una
 * ErrorApi con el codigo adecuado. Asi los servicios no tienen que atrapar
 * cada uno de estos casos.
 */
function normalizar(error) {
  if (error instanceof ErrorApi) return error;

  // Validacion del esquema de Mongoose: se juntan todos los mensajes.
  if (error instanceof mongoose.Error.ValidationError) {
    const mensajes = Object.values(error.errors).map((e) => e.message);
    return new ErrorApi(400, 'Datos no válidos', mensajes.join('; '));
  }
  // Un id con formato incorrecto que llego hasta una consulta.
  if (error instanceof mongoose.Error.CastError) {
    return new ErrorApi(400, `Valor no válido para ${error.path}`, `Valor recibido: ${error.value}`);
  }
  // Violacion de un indice unico (username o email repetido). Es la ultima
  // barrera: el servicio ya valida antes, pero dos peticiones simultaneas
  // podrian pasar ambas la validacion.
  if (error?.code === 11000) {
    const campo = Object.keys(error.keyValue ?? {})[0] ?? 'campo';
    return new ErrorApi(409, `Ya existe un registro con ese ${campo}`, `Valor: ${error.keyValue?.[campo]}`);
  }
  // Errores de express.json(): JSON mal formado o cuerpo demasiado grande.
  if (error?.type === 'entity.parse.failed') {
    return new ErrorApi(400, 'El cuerpo de la petición no es JSON válido', error.message);
  }
  if (error?.type === 'entity.too.large') {
    return new ErrorApi(413, 'El cuerpo de la petición es demasiado grande', `Límite: ${error.limit} bytes`);
  }
  return null;
}

/**
 * Middleware final: toda excepcion termina aqui y sale con el mismo JSON
 * { estado, error, detalle, fecha }. Lleva cuatro parametros porque es asi
 * como Express reconoce un manejador de errores.
 */
export function manejarErrores(error, req, res, _next) {
  const conocido = normalizar(error);

  if (!conocido) {
    // Error inesperado: se registra completo en la consola, pero al cliente
    // no se le envia el stack ni el mensaje interno.
    console.error(`[error] ${req.method} ${req.originalUrl}`, error);
  }

  const estado = conocido?.estado ?? 500;
  res.status(estado).json({
    estado,
    error: conocido?.message ?? 'Error interno del servidor',
    detalle: conocido?.detalle ?? null,
    fecha: new Date().toISOString(),
  });
}
