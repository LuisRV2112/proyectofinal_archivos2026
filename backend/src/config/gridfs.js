import mongoose from 'mongoose';
import { finished } from 'node:stream/promises';

/**
 * Acceso a GridFS, donde se guarda el CONTENIDO de los archivos.
 *
 * Por que GridFS y no un campo en el documento `archivos`:
 *  - Separa los metadatos (nombre, tamano, permisos), que se leen en cada
 *    listado, del contenido, que solo se lee al descargar. Asi listar una
 *    carpeta no arrastra los bytes de todos sus archivos.
 *  - Parte el contenido en chunks de 255 KB, de modo que ningun archivo choca
 *    con el limite de 16 MB de un documento BSON.
 *  - Es el mecanismo que MongoDB provee para esto; guardar una ruta a un
 *    archivo del disco del servidor dejaria parte de los datos fuera de la base
 *    (sin respaldo ni replicacion junto con ella).
 *
 * Por que el driver nativo y no Mongoose: Mongoose no integra GridFS. El
 * GridFSBucket se construye sobre la conexion que Mongoose ya abrio
 * (mongoose.connection.db), asi que no hay una segunda conexion.
 *
 * El bucket se llama `contenido`, lo que crea las colecciones
 * `contenido.files` (un documento por archivo) y `contenido.chunks` (los bytes).
 */
export const NOMBRE_BUCKET = 'contenido';

let bucket = null;
let dbDelBucket = null;

export function obtenerBucket() {
  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('GridFS requiere una conexion activa: llama antes a conectarBaseDatos()');
  }
  // Se crea una sola vez y se reutiliza; si la conexion cambio (p. ej. tras
  // reconectar en un script), se vuelve a construir sobre la nueva.
  if (!bucket || dbDelBucket !== db) {
    bucket = new mongoose.mongo.GridFSBucket(db, { bucketName: NOMBRE_BUCKET });
    dbDelBucket = db;
  }
  return bucket;
}

/**
 * Sube un Buffer a GridFS y devuelve su _id y su tamano real en bytes.
 * El tamano se toma del documento que GridFS escribio en contenido.files, de
 * modo que `archivo.tamano` coincide exactamente con lo almacenado.
 */
export async function subirContenido(buffer, nombreArchivo, metadata = {}) {
  const flujo = obtenerBucket().openUploadStream(nombreArchivo, { metadata });
  flujo.end(buffer);
  await finished(flujo);
  return { gridfsId: flujo.id, tamano: flujo.gridFSFile.length };
}

/** Devuelve un stream de lectura, para enviar la descarga sin cargarla entera. */
export function abrirDescarga(gridfsId) {
  return obtenerBucket().openDownloadStream(gridfsId);
}

/**
 * Comprueba que el contenido exista antes de abrir la descarga. Si faltara,
 * el stream fallaria recien al leer, cuando la respuesta ya empezo a
 * enviarse y no se puede responder con un error JSON.
 */
export async function existeContenido(gridfsId) {
  return (await obtenerBucket().find({ _id: gridfsId }, { limit: 1 }).toArray()).length > 0;
}

/** Lee el contenido completo en memoria (util para scripts y archivos pequenos). */
export async function leerContenido(gridfsId) {
  const partes = [];
  for await (const parte of abrirDescarga(gridfsId)) partes.push(parte);
  return Buffer.concat(partes);
}

/**
 * Cambia el `filename` de contenido.files, para que coincida con el nombre
 * visible del archivo al renombrarlo (igual que hace el seed). Los chunks no
 * se tocan: el contenido es el mismo.
 */
export async function renombrarContenido(gridfsId, nombreNuevo) {
  await obtenerBucket().rename(gridfsId, nombreNuevo);
}

/** Borra el documento de contenido.files y todos sus chunks. */
export async function eliminarContenido(gridfsId) {
  await obtenerBucket().delete(gridfsId);
}
