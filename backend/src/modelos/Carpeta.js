import mongoose from 'mongoose';
import { esquemaPermiso, campoEliminado, marcasDeTiempo, limpiarJSON } from './esquemasComunes.js';

const { Schema } = mongoose;

// Patron Array of Ancestors: padreId + lista de ancestros desde la raiz.
// - Subarbol en una consulta: find({ ancestros: id })
// - Ciclo al mover A dentro de B: A esta en B.ancestros
// Costo: al mover hay que actualizar ancestros y ruta del subarbol, pero
// mover es raro y listar es constante. Con solo padreId haria falta una
// consulta por nivel o $graphLookup.
const esquemaCarpeta = new Schema(
  {
    nombre: {
      type: String,
      required: [true, 'El nombre de la carpeta es obligatorio'],
      trim: true,
      maxlength: [100, 'El nombre de la carpeta no puede superar 100 caracteres'],
      // La barra separa niveles en la ruta.
      match: [/^[^/\\]+$/, 'El nombre de la carpeta no puede contener / ni \\'],
    },
    // Referencia: si se copiara el nombre habria que actualizarlo en todas sus carpetas.
    propietarioId: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true },
    // null = raiz del usuario
    padreId: { type: Schema.Types.ObjectId, ref: 'Carpeta', default: null },
    // De la raiz al padre directo
    ancestros: { type: [{ type: Schema.Types.ObjectId, ref: 'Carpeta' }], default: [] },
    // Redundante con ancestros, pero evita cargarlos para mostrar la ubicacion.
    ruta: { type: String, required: true },
    // Compartir una carpeta da acceso a todo su contenido (herencia por ancestros).
    compartidoCon: { type: [esquemaPermiso], default: [] },
    eliminado: campoEliminado,
  },
  {
    timestamps: marcasDeTiempo,
    toJSON: { transform: limpiarJSON },
  }
);

// Indices

// Subcarpetas de una carpeta; tambien sirve para "todas las carpetas del usuario".
esquemaCarpeta.index({ propietarioId: 1, padreId: 1 });
// Multiclave (es un array): subarbol completo.
esquemaCarpeta.index({ ancestros: 1 });
// Compartido conmigo y permisos heredados.
esquemaCarpeta.index({ 'compartidoCon.usuarioId': 1 });
// Papelera.
esquemaCarpeta.index({ 'eliminado.estado': 1 });

export const Carpeta = mongoose.model('Carpeta', esquemaCarpeta, 'carpetas');
