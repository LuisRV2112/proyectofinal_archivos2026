import multer from 'multer';
import { EXTENSIONES_PERMITIDAS } from '../modelos/index.js';
import { ErrorValidacion } from '../utilidades/errores.js';
import { extensionDe } from '../utilidades/formato.js';

// 5 MB: holgado para documentos de texto y Markdown, y acota la memoria que
// puede ocupar una subida (el archivo se guarda entero en memoria).
export const TAMANO_MAXIMO_BYTES = 5 * 1024 * 1024;

/**
 * multer con almacenamiento EN MEMORIA: el archivo queda en `req.file.buffer`
 * y el servicio lo pasa directo a GridFS. Nunca toca el disco del servidor,
 * asi que no hay archivos temporales que limpiar ni una copia del contenido
 * fuera de la base de datos.
 */
const multerArchivo = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: TAMANO_MAXIMO_BYTES,
    files: 1,
    // Solo se esperan campos cortos (carpetaId, etiquetas, origen).
    fields: 5,
    fieldSize: 2 * 1024,
  },
  // Los navegadores envian el nombre del archivo en UTF-8; sin esto, un
  // "información.md" llegaria con las tildes mal decodificadas.
  defParamCharset: 'utf8',
  // Se rechaza por extension ANTES de leer el contenido: un PDF de 5 MB no
  // llega a cargarse en memoria.
  fileFilter(_req, archivo, aceptar) {
    const extension = extensionDe(archivo.originalname);
    if (!EXTENSIONES_PERMITIDAS.includes(extension)) {
      aceptar(
        new ErrorValidacion(
          'Tipo de archivo no permitido',
          `Solo se aceptan ${EXTENSIONES_PERMITIDAS.map((e) => '.' + e).join(' y ')}; se recibió "${archivo.originalname}"`
        )
      );
      return;
    }
    aceptar(null, true);
  },
});

/** Un solo archivo en el campo `archivo` del formulario multipart. */
export const recibirArchivo = multerArchivo.single('archivo');
