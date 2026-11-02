import mongoose from 'mongoose';

const { Schema } = mongoose;

export const ACCIONES = [
  'LOGIN',
  // Para detectar intentos de adivinar contrasenas.
  'LOGIN_FALLIDO',
  'CREAR_USUARIO',
  'MODIFICAR_USUARIO',
  'ACTIVAR_USUARIO',
  'DESACTIVAR_USUARIO',
  'CREAR_CARPETA',
  'ELIMINAR_CARPETA',
  'SUBIR',
  'DESCARGAR',
  'RENOMBRAR',
  'MOVER',
  'ELIMINAR',
  'RESTAURAR',
  'ELIMINAR_DEFINITIVO',
  'COMPARTIR',
  'MODIFICAR_PERMISO',
  'REVOCAR',
];

export const TIPOS_RECURSO = ['ARCHIVO', 'CARPETA', 'USUARIO'];

// Coleccion aparte y no embebida en el usuario: crece sin limite y llegaria
// a los 16 MB del documento. Los reportes ademas agrupan todos los usuarios.
// Solo se inserta, nunca se modifica.
function esObligatorioSalvoLoginFallido() {
  return this.accion !== 'LOGIN_FALLIDO';
}

const esquemaActividad = new Schema(
  {
    // Falta solo en LOGIN_FALLIDO con un username que no existe.
    usuarioId: { type: Schema.Types.ObjectId, ref: 'Usuario', required: esObligatorioSalvoLoginFallido },
    accion: {
      type: String,
      required: true,
      enum: { values: ACCIONES, message: 'Accion no valida: {VALUE}' },
    },
    recursoTipo: {
      type: String,
      required: true,
      enum: { values: TIPOS_RECURSO, message: 'Tipo de recurso no valido: {VALUE}' },
    },
    recursoId: { type: Schema.Types.ObjectId, required: esObligatorioSalvoLoginFallido },
    // Denormalizado: el historial sigue legible si el recurso se borra.
    recursoNombre: { type: String, required: true },
    detalle: { type: String, default: '' },
    fecha: { type: Date, required: true, default: Date.now },
  },
  {
    versionKey: false,
  }
);

// Indices

// Historial de un usuario; sirve tambien para filtrar por rango de fechas.
esquemaActividad.index({ usuarioId: 1, fecha: -1 });
// Reportes.
esquemaActividad.index({ accion: 1 });
esquemaActividad.index({ fecha: -1 });

export const Actividad = mongoose.model('Actividad', esquemaActividad, 'actividad');
