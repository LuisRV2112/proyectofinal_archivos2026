import mongoose from 'mongoose';
import { ErrorValidacion } from './errores.js';

/**
 * Validaciones de entrada comunes a varios endpoints. Se hacen en el servicio,
 * antes de tocar la base, para devolver un 400 con un mensaje claro en lugar
 * de dejar que Mongoose falle con un CastError poco legible.
 */

/** Convierte un id de la URL en ObjectId, o responde 400 si no lo es. */
export function exigirObjectId(valor, campo = 'id') {
  if (typeof valor !== 'string' || !mongoose.isValidObjectId(valor) || !/^[0-9a-f]{24}$/i.test(valor)) {
    throw new ErrorValidacion(`El ${campo} no es un identificador válido`, `Valor recibido: ${valor}`);
  }
  return new mongoose.Types.ObjectId(valor);
}

/** Exige un texto no vacio y lo devuelve recortado. */
export function exigirTexto(valor, campo) {
  if (typeof valor !== 'string' || valor.trim() === '') {
    throw new ErrorValidacion(`El campo "${campo}" es obligatorio y debe ser texto`);
  }
  return valor.trim();
}

/**
 * Rechaza campos que el endpoint no acepta. Evita que un cliente cuele
 * campos que debe calcular el servidor (p. ej. `almacenamientoUsado` o
 * `passwordHash`) y que un error de tipeo pase en silencio.
 */
export function rechazarCamposDesconocidos(cuerpo, permitidos) {
  const desconocidos = Object.keys(cuerpo).filter((c) => !permitidos.includes(c));
  if (desconocidos.length) {
    throw new ErrorValidacion(
      `Campos no permitidos: ${desconocidos.join(', ')}`,
      `Campos aceptados: ${permitidos.join(', ')}`
    );
  }
}

/** El cuerpo de la peticion debe ser un objeto JSON. */
export function exigirObjeto(cuerpo) {
  if (!cuerpo || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) {
    throw new ErrorValidacion('El cuerpo de la petición debe ser un objeto JSON');
  }
  return cuerpo;
}
