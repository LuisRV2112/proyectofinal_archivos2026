import mongoose from 'mongoose';
import { esquemaPermiso, campoEliminado, marcasDeTiempo, limpiarJSON } from './esquemasComunes.js';

const { Schema } = mongoose;

export const EXTENSIONES_PERMITIDAS = ['txt', 'md'];

export const MIME_POR_EXTENSION = {
  txt: 'text/plain',
  md: 'text/markdown',
};

// Solo metadatos; el contenido esta en GridFS (ver config/gridfs.js).
const esquemaArchivo = new Schema(
  {
    nombre: {
      type: String,
      required: [true, 'El nombre del archivo es obligatorio'],
      trim: true,
      maxlength: [150, 'El nombre del archivo no puede superar 150 caracteres'],
      match: [/^[^/\\]+$/, 'El nombre del archivo no puede contener / ni \\'],
    },
    // Separada del nombre para agrupar por tipo con indice.
    extension: {
      type: String,
      required: true,
      lowercase: true,
      enum: { values: EXTENSIONES_PERMITIDAS, message: 'Solo se permiten archivos .txt y .md' },
    },
    mimeType: { type: String, required: true },
    // Bytes, igual a length en contenido.files
    tamano: { type: Number, required: true, min: 0 },
    propietarioId: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true },
    // null = raiz
    carpetaId: { type: Schema.Types.ObjectId, ref: 'Carpeta', default: null },
    // carpeta.ancestros + carpetaId. Sirve para buscar en un subarbol y para
    // saber si hereda permisos de alguna carpeta compartida.
    ancestros: { type: [{ type: Schema.Types.ObjectId, ref: 'Carpeta' }], default: [] },
    // Referencia a contenido.files: el contenido solo se lee al descargar.
    gridfsId: { type: Schema.Types.ObjectId, required: true },
    etiquetas: {
      type: [{ type: String, trim: true, lowercase: true, maxlength: 40 }],
      default: [],
    },
    // Embebidos, ver esquemasComunes.js
    compartidoCon: { type: [esquemaPermiso], default: [] },
    eliminado: campoEliminado,
  },
  {
    timestamps: marcasDeTiempo,
    toJSON: { transform: limpiarJSON },
  }
);

// Evita guardar "informe.pdf" con extension "txt".
esquemaArchivo.pre('validate', function () {
  if (this.nombre && this.extension && !this.nombre.toLowerCase().endsWith(`.${this.extension}`)) {
    this.invalidate('nombre', `El nombre debe terminar en .${this.extension}`);
  }
});

// Indices

// Archivos de una carpeta.
esquemaArchivo.index({ propietarioId: 1, carpetaId: 1 });
// Busqueda en un subarbol (multiclave).
esquemaArchivo.index({ ancestros: 1 });
// Compartido conmigo.
esquemaArchivo.index({ 'compartidoCon.usuarioId': 1 });
// Papelera.
esquemaArchivo.index({ 'eliminado.estado': 1 });
// Solo se permite un indice de texto por coleccion, por eso van juntos.
// En espanol para que "contratos" encuentre "contrato".
esquemaArchivo.index(
  { nombre: 'text', etiquetas: 'text' },
  { name: 'busqueda_texto', default_language: 'spanish' }
);
// Reportes.
esquemaArchivo.index({ extension: 1 });
esquemaArchivo.index({ creadoEn: -1 });

export const Archivo = mongoose.model('Archivo', esquemaArchivo, 'archivos');
