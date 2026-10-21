import mongoose from 'mongoose';
import { esquemaPermiso, campoEliminado, marcasDeTiempo, limpiarJSON } from './esquemasComunes.js';

const { Schema } = mongoose;

// El enunciado limita los tipos a texto plano y Markdown.
export const EXTENSIONES_PERMITIDAS = ['txt', 'md'];

export const MIME_POR_EXTENSION = {
  txt: 'text/plain',
  md: 'text/markdown',
};

/**
 * Metadatos de un archivo. El CONTENIDO no esta aqui sino en GridFS
 * (`gridfsId`): ver src/config/gridfs.js para el porque.
 */
const esquemaArchivo = new Schema(
  {
    // Nombre completo con extension: "contrato-2026.md".
    nombre: {
      type: String,
      required: [true, 'El nombre del archivo es obligatorio'],
      trim: true,
      maxlength: [150, 'El nombre del archivo no puede superar 150 caracteres'],
      match: [/^[^/\\]+$/, 'El nombre del archivo no puede contener / ni \\'],
    },
    // Se guarda aparte del nombre para agrupar y filtrar por tipo (reportes)
    // con un indice, sin tener que analizar el texto del nombre.
    extension: {
      type: String,
      required: true,
      lowercase: true,
      enum: { values: EXTENSIONES_PERMITIDAS, message: 'Solo se permiten archivos .txt y .md' },
    },
    mimeType: { type: String, required: true },
    // Bytes. Coincide con `length` del documento en contenido.files.
    tamano: { type: Number, required: true, min: 0 },
    // Referencia: ver el comentario equivalente en Carpeta.
    propietarioId: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true },
    // Carpeta directa; null = raiz del usuario.
    carpetaId: { type: Schema.Types.ObjectId, ref: 'Carpeta', default: null },
    // Todas las carpetas que lo contienen, de la raiz a la directa INCLUIDA
    // (es decir, carpeta.ancestros + [carpetaId]). Asi {ancestros: X} trae los
    // archivos de todo el subarbol de X en una consulta, y la herencia de
    // permisos es comprobar si alguna carpeta compartida con el usuario esta
    // en este array.
    ancestros: { type: [{ type: Schema.Types.ObjectId, ref: 'Carpeta' }], default: [] },
    // Referencia al documento de contenido.files. Va por separado y no
    // embebido porque el contenido solo se lee al descargar.
    gridfsId: { type: Schema.Types.ObjectId, required: true },
    etiquetas: {
      type: [{ type: String, trim: true, lowercase: true, maxlength: 40 }],
      default: [],
    },
    // EMBEBIDOS: ver esquemasComunes.js.
    compartidoCon: { type: [esquemaPermiso], default: [] },
    eliminado: campoEliminado,
  },
  {
    timestamps: marcasDeTiempo,
    toJSON: { transform: limpiarJSON },
  }
);

// La extension debe ser la del nombre: si no, un "informe.pdf" podria
// guardarse declarando extension "txt" y saltarse la restriccion de tipos.
esquemaArchivo.pre('validate', function () {
  if (this.nombre && this.extension && !this.nombre.toLowerCase().endsWith(`.${this.extension}`)) {
    this.invalidate('nombre', `El nombre debe terminar en .${this.extension}`);
  }
});

// --- Indices (tabla 4.4 del modelo) ---

// Listar los archivos de una carpeta de un usuario.
esquemaArchivo.index({ propietarioId: 1, carpetaId: 1 });
// Busqueda dentro de un subarbol (multiclave).
esquemaArchivo.index({ ancestros: 1 });
// "Compartido conmigo".
esquemaArchivo.index({ 'compartidoCon.usuarioId': 1 });
// Papelera y exclusion en listados.
esquemaArchivo.index({ 'eliminado.estado': 1 });
// Busqueda por texto en nombre y etiquetas. Una coleccion admite un solo
// indice de texto, por eso ambos campos van en el mismo. Idioma espanol para
// que la busqueda ignore palabras vacias ("de", "la") y use raices
// ("contratos" encuentra "contrato").
esquemaArchivo.index(
  { nombre: 'text', etiquetas: 'text' },
  { name: 'busqueda_texto', default_language: 'spanish' }
);
// Reportes: agrupacion por tipo y por fecha de subida.
esquemaArchivo.index({ extension: 1 });
esquemaArchivo.index({ creadoEn: -1 });

export const Archivo = mongoose.model('Archivo', esquemaArchivo, 'archivos');
