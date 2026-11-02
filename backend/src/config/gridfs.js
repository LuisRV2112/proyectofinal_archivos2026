import mongoose from 'mongoose';
import { finished } from 'node:stream/promises';

// Contenido de los archivos en GridFS:
// - los listados leen solo metadatos, el contenido se lee al descargar
// - los chunks de 255 KB evitan el limite de 16 MB por documento
// - no quedan datos fuera de la base, como pasaria guardando rutas del disco
// Mongoose no soporta GridFS, asi que se usa el driver sobre la misma conexion.
// Colecciones: contenido.files y contenido.chunks.
export const NOMBRE_BUCKET = 'contenido';

let bucket = null;
let dbDelBucket = null;

export function obtenerBucket() {
  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('GridFS requiere una conexion activa: llama antes a conectarBaseDatos()');
  }
  // Se recrea solo si cambio la conexion.
  if (!bucket || dbDelBucket !== db) {
    bucket = new mongoose.mongo.GridFSBucket(db, { bucketName: NOMBRE_BUCKET });
    dbDelBucket = db;
  }
  return bucket;
}

// El tamano sale de contenido.files para que coincida con lo guardado.
export async function subirContenido(buffer, nombreArchivo, metadata = {}) {
  const flujo = obtenerBucket().openUploadStream(nombreArchivo, { metadata });
  flujo.end(buffer);
  await finished(flujo);
  return { gridfsId: flujo.id, tamano: flujo.gridFSFile.length };
}

// Stream para no cargar el archivo entero en memoria.
export function abrirDescarga(gridfsId) {
  return obtenerBucket().openDownloadStream(gridfsId);
}

// Se revisa antes porque si el stream falla ya no se puede responder con JSON.
export async function existeContenido(gridfsId) {
  return (await obtenerBucket().find({ _id: gridfsId }, { limit: 1 }).toArray()).length > 0;
}

export async function leerContenido(gridfsId) {
  const partes = [];
  for await (const parte of abrirDescarga(gridfsId)) partes.push(parte);
  return Buffer.concat(partes);
}

// Solo cambia el filename; los chunks quedan igual.
export async function renombrarContenido(gridfsId, nombreNuevo) {
  await obtenerBucket().rename(gridfsId, nombreNuevo);
}

export async function eliminarContenido(gridfsId) {
  await obtenerBucket().delete(gridfsId);
}
