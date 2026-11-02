import mongoose from 'mongoose';
import multer from 'multer';
import { ErrorApi, ErrorNoEncontrado } from '../utilidades/errores.js';
import { formatearBytes } from '../utilidades/formato.js';
import { TAMANO_MAXIMO_BYTES } from './subida.js';

export function rutaNoEncontrada(req, _res, next) {
  next(new ErrorNoEncontrado('Ruta no encontrada', `${req.method} ${req.originalUrl}`));
}

// Convierte errores de Mongoose, multer y express.json a ErrorApi.
function normalizar(error) {
  if (error instanceof ErrorApi) return error;

  if (error instanceof mongoose.Error.ValidationError) {
    const mensajes = Object.values(error.errors).map((e) => e.message);
    return new ErrorApi(400, 'Datos no válidos', mensajes.join('; '));
  }
  if (error instanceof mongoose.Error.CastError) {
    return new ErrorApi(400, `Valor no válido para ${error.path}`, `Valor recibido: ${error.value}`);
  }
  // Indice unico. El servicio ya valida, pero dos peticiones a la vez podrian pasar.
  if (error?.code === 11000) {
    const campo = Object.keys(error.keyValue ?? {})[0] ?? 'campo';
    return new ErrorApi(409, `Ya existe un registro con ese ${campo}`, `Valor: ${error.keyValue?.[campo]}`);
  }
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return new ErrorApi(413, 'El archivo supera el tamaño máximo permitido', `Máximo: ${formatearBytes(TAMANO_MAXIMO_BYTES)}`);
    }
    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      return new ErrorApi(400, 'Se esperaba un único archivo en el campo "archivo"', `Campo recibido: ${error.field}`);
    }
    return new ErrorApi(400, 'Formulario de subida no válido', error.message);
  }
  if (error?.type === 'entity.parse.failed') {
    return new ErrorApi(400, 'El cuerpo de la petición no es JSON válido', error.message);
  }
  if (error?.type === 'entity.too.large') {
    return new ErrorApi(413, 'El cuerpo de la petición es demasiado grande', `Límite: ${error.limit} bytes`);
  }
  return null;
}

// Todos los errores salen con { estado, error, detalle, fecha }.
// Necesita los 4 parametros para que Express lo trate como manejador de errores.
export function manejarErrores(error, req, res, _next) {
  const conocido = normalizar(error);

  if (!conocido) {
    // Al cliente no se le envia el error interno.
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
