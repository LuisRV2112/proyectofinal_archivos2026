import mongoose from 'mongoose';

const { Schema } = mongoose;

export const ACCIONES = [
  'LOGIN',
  'CREAR_USUARIO',
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

/**
 * Historial de actividad: COLECCION APARTE, con referencia al usuario.
 *
 * Es el caso de libro para usar referencias en vez de embeber: el historial
 * crece sin limite. Embebido en el usuario, un usuario activo acabaria chocando
 * contra el limite de 16 MB del documento, y cada login reescribiria un
 * documento cada vez mas grande. Ademas los reportes de actividad agrupan
 * entradas de todos los usuarios, algo natural sobre una coleccion propia.
 *
 * Las entradas no se modifican nunca despues de crearse (solo se insertan),
 * por eso no hay `actualizadoEn`.
 */
const esquemaActividad = new Schema(
  {
    // Quien hizo la operacion.
    usuarioId: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true },
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
    recursoId: { type: Schema.Types.ObjectId, required: true },
    // DENORMALIZADO: copia del nombre en el momento de la operacion. Si el
    // recurso se elimina definitivamente, `recursoId` ya no apunta a nada,
    // pero el historial tiene que seguir siendo legible ("Eliminado
    // definitivamente: factura-0231.txt"). Tambien conserva el nombre de
    // entonces aunque luego se renombre.
    recursoNombre: { type: String, required: true },
    detalle: { type: String, default: '' },
    fecha: { type: Date, required: true, default: Date.now },
  },
  {
    // Sin timestamps automaticos: la fecha de la operacion es `fecha`.
    versionKey: false,
  }
);

// --- Indices (tabla 4.4 del modelo) ---

// Historial de un usuario, del mas reciente al mas antiguo. El campo de
// igualdad (usuarioId) va primero y el de orden (fecha) despues, asi el
// indice sirve tambien para filtrar por rango de fechas del mismo usuario.
esquemaActividad.index({ usuarioId: 1, fecha: -1 });
// Reportes: operaciones por tipo y por periodo.
esquemaActividad.index({ accion: 1 });
esquemaActividad.index({ fecha: -1 });

export const Actividad = mongoose.model('Actividad', esquemaActividad, 'actividad');
