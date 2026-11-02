import multer from 'multer';
import { EXTENSIONES_PERMITIDAS } from '../modelos/index.js';
import { ErrorValidacion } from '../utilidades/errores.js';
import { extensionDe } from '../utilidades/formato.js';

// El archivo se guarda entero en memoria, asi que se limita.
export const TAMANO_MAXIMO_BYTES = 5 * 1024 * 1024;

// En memoria: el buffer va directo a GridFS sin pasar por el disco.
const multerArchivo = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: TAMANO_MAXIMO_BYTES,
    files: 1,
    fields: 5,
    fieldSize: 2 * 1024,
  },
  // Para que los nombres con tildes lleguen bien.
  defParamCharset: 'utf8',
  // Se rechaza antes de cargar el contenido.
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

export const recibirArchivo = multerArchivo.single('archivo');
