import mongoose from 'mongoose';

const { Schema } = mongoose;

// Subdocumentos usados por carpetas y archivos.

// Ordenados de menor a mayor. Si llega el mismo recurso por dos vias, gana el mayor.
export const NIVELES_PERMISO = ['LECTURA', 'COMENTARIO', 'EDICION'];

// Permiso EMBEBIDO: se lee siempre junto al recurso y son pocos por recurso,
// asi que se valida el acceso sin otra consulta. "Compartido conmigo" usa el
// indice sobre compartidoCon.usuarioId. Sin _id: se identifica por usuarioId.
export const esquemaPermiso = new Schema(
  {
    usuarioId: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true },
    nivel: {
      type: String,
      enum: { values: NIVELES_PERMISO, message: 'Nivel de permiso no valido: {VALUE}' },
      required: true,
    },
    otorgadoPor: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true },
    otorgadoEn: { type: Date, required: true, default: Date.now },
  },
  { _id: false }
);

// Papelera EMBEBIDA: es uno a uno con el recurso y nunca se consulta sola.
// Eliminar solo marca estado: true, por eso se puede restaurar.
export const esquemaEliminado = new Schema(
  {
    estado: { type: Boolean, required: true, default: false },
    fecha: { type: Date, default: null },
    eliminadoPor: { type: Schema.Types.ObjectId, ref: 'Usuario', default: null },
    // Donde estaba al eliminarse. Si ya no existe, se restaura a la raiz.
    padreOriginalId: { type: Schema.Types.ObjectId, ref: 'Carpeta', default: null },
  },
  { _id: false }
);

// Sin el default los documentos nuevos no tendrian eliminado.estado: false
// y el filtro de los listados los dejaria fuera.
export const campoEliminado = {
  type: esquemaEliminado,
  default: () => ({}),
};

export const marcasDeTiempo = { createdAt: 'creadoEn', updatedAt: 'actualizadoEn' };

export function limpiarJSON(_documento, objeto) {
  delete objeto.__v;
  return objeto;
}
