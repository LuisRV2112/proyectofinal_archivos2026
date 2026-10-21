import mongoose from 'mongoose';

const ESTADOS_CONEXION = ['desconectado', 'conectado', 'conectando', 'desconectando'];

/**
 * Estado del servidor y de la conexion a MongoDB. Ademas del estado que
 * reporta Mongoose se hace un `ping` real, porque la conexion puede figurar
 * como abierta y aun asi no responder.
 */
export async function obtenerSalud() {
  const conexion = mongoose.connection;
  let ping = false;
  try {
    ping = (await conexion.db?.admin().ping())?.ok === 1;
  } catch {
    ping = false;
  }
  return {
    estado: ping ? 'ok' : 'degradado',
    mongodb: {
      conexion: ESTADOS_CONEXION[conexion.readyState] ?? 'desconocido',
      responde: ping,
      baseDatos: conexion.name ?? null,
    },
    tiempoActivoSegundos: Math.round(process.uptime()),
    fecha: new Date().toISOString(),
  };
}
