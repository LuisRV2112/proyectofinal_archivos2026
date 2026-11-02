import mongoose from 'mongoose';

const { Schema } = mongoose;

export const ROLES = ['ADMINISTRADOR', 'USUARIO'];

// 20 MB alcanza para cientos de .txt/.md y se puede llenar en una demo.
export const CUOTA_POR_DEFECTO = 20 * 1024 * 1024;
// Tope para evitar errores de tipeo del administrador.
export const CUOTA_MAXIMA = 10 * 1024 * 1024 * 1024;

const esquemaUsuario = new Schema(
  {
    // unique crea el indice {username: 1} que usa el login.
    username: {
      type: String,
      required: [true, 'El nombre de usuario es obligatorio'],
      unique: true,
      trim: true,
      lowercase: true,
      minlength: [3, 'El nombre de usuario debe tener al menos 3 caracteres'],
      maxlength: [30, 'El nombre de usuario no puede superar 30 caracteres'],
      match: [/^[a-z0-9._-]+$/, 'El nombre de usuario solo admite letras, numeros, punto, guion y guion bajo'],
    },
    email: {
      type: String,
      required: [true, 'El correo es obligatorio'],
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'El correo no tiene un formato valido'],
    },
    // bcrypt. select: false para que solo lo traiga el login con +passwordHash.
    passwordHash: { type: String, required: true, select: false },
    nombreCompleto: {
      type: String,
      required: [true, 'El nombre completo es obligatorio'],
      trim: true,
      maxlength: 100,
    },
    rol: {
      type: String,
      enum: { values: ROLES, message: 'Rol no valido: {VALUE}' },
      default: 'USUARIO',
    },
    // Desactivar no borra sus documentos ni su historial.
    activo: { type: Boolean, default: true },
    // Denormalizado (Computed Pattern) para no sumar archivos en cada consulta.
    // Sube al subir y baja al eliminar definitivo; la papelera no lo libera.
    almacenamientoUsado: { type: Number, default: 0, min: 0 },
    // Espacio asignado por el administrador. El disponible no se guarda,
    // se calcula con el virtual almacenamientoDisponible.
    cuotaAlmacenamiento: {
      type: Number,
      default: CUOTA_POR_DEFECTO,
      min: [0, 'La cuota no puede ser negativa'],
      max: [CUOTA_MAXIMA, 'La cuota no puede superar 10 GB'],
      validate: { validator: Number.isInteger, message: 'La cuota debe ser un número entero de bytes' },
    },
  },
  {
    timestamps: { createdAt: 'creadoEn', updatedAt: false },
    // virtuals para enviar almacenamientoDisponible; id: false para no duplicar _id.
    id: false,
    toJSON: {
      virtuals: true,
      // Por si se cargo el hash, nunca se envia.
      transform(_documento, objeto) {
        delete objeto.passwordHash;
        delete objeto.__v;
        return objeto;
      },
    },
  }
);

// Nunca negativo aunque la cuota quede por debajo de lo usado.
esquemaUsuario.virtual('almacenamientoDisponible').get(function () {
  return Math.max(0, this.cuotaAlmacenamiento - this.almacenamientoUsado);
});

// Nombre de coleccion explicito: la pluralizacion de Mongoose es en ingles.
export const Usuario = mongoose.model('Usuario', esquemaUsuario, 'usuarios');
