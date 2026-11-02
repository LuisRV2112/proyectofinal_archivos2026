import mongoose from 'mongoose';
import { ErrorValidacion } from './errores.js';

// Validaciones de entrada para responder 400 con un mensaje claro.

export function exigirObjectId(valor, campo = 'id') {
  if (typeof valor !== 'string' || !mongoose.isValidObjectId(valor) || !/^[0-9a-f]{24}$/i.test(valor)) {
    throw new ErrorValidacion(`El ${campo} no es un identificador válido`, `Valor recibido: ${valor}`);
  }
  return new mongoose.Types.ObjectId(valor);
}

export function exigirTexto(valor, campo) {
  if (typeof valor !== 'string' || valor.trim() === '') {
    throw new ErrorValidacion(`El campo "${campo}" es obligatorio y debe ser texto`);
  }
  return valor.trim();
}

// Evita que el cliente envie campos como almacenamientoUsado o passwordHash.
export function rechazarCamposDesconocidos(cuerpo, permitidos) {
  const desconocidos = Object.keys(cuerpo).filter((c) => !permitidos.includes(c));
  if (desconocidos.length) {
    throw new ErrorValidacion(
      `Campos no permitidos: ${desconocidos.join(', ')}`,
      `Campos aceptados: ${permitidos.join(', ')}`
    );
  }
}

export function exigirObjeto(cuerpo) {
  if (!cuerpo || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) {
    throw new ErrorValidacion('El cuerpo de la petición debe ser un objeto JSON');
  }
  return cuerpo;
}
