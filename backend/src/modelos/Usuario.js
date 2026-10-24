import mongoose from 'mongoose';

const { Schema } = mongoose;

export const ROLES = ['ADMINISTRADOR', 'USUARIO'];

// Cuota de una cuenta nueva si el administrador no indica otra. 20 MB
// alcanzan para cientos de documentos .txt/.md (el seed usa unos 18 KB por
// usuario) y a la vez es un limite que se puede alcanzar en una demostracion.
export const CUOTA_POR_DEFECTO = 20 * 1024 * 1024;
// Tope de lo que el administrador puede asignar: evita un valor absurdo por un
// error de tipeo (p. ej. bytes escritos como si fueran MB).
export const CUOTA_MAXIMA = 10 * 1024 * 1024 * 1024;

const esquemaUsuario = new Schema(
  {
    // `unique` en el campo crea el indice unico {username: 1}, que es el que
    // usa el login para encontrar al usuario.
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
    // Indice unico {email: 1}: dos cuentas no pueden compartir correo.
    email: {
      type: String,
      required: [true, 'El correo es obligatorio'],
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'El correo no tiene un formato valido'],
    },
    // Hash de bcrypt, nunca la contrasena. `select: false` hace que ninguna
    // consulta lo traiga salvo que se pida a proposito con
    // .select('+passwordHash'), que solo hace el login. Asi no puede salir en
    // una respuesta de la API por descuido.
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
    // Desactivar no borra: el usuario deja de poder entrar, pero sus
    // documentos y su historial se conservan.
    activo: { type: Boolean, default: true },
    // Bytes ocupados por sus archivos. DENORMALIZADO a proposito (Computed
    // Pattern): calcularlo con una agregacion sobre `archivos` en cada consulta
    // seria costoso, y el dato se pide a menudo (perfil, reportes). Se mantiene
    // al dia sumando en cada subida y restando en cada eliminacion definitiva.
    // Enviar a la papelera NO lo libera: el archivo sigue ocupando espacio.
    almacenamientoUsado: { type: Number, default: 0, min: 0 },
    // Bytes ASIGNADOS al usuario: subir un archivo que no cabe se rechaza.
    // Lo fija el administrador. El espacio DISPONIBLE no se guarda: es
    // cuota - usado, y guardarlo seria un segundo dato denormalizado que
    // habria que mantener sincronizado en cada subida y eliminacion. Se expone
    // con el virtual `almacenamientoDisponible`.
    cuotaAlmacenamiento: {
      type: Number,
      default: CUOTA_POR_DEFECTO,
      min: [0, 'La cuota no puede ser negativa'],
      max: [CUOTA_MAXIMA, 'La cuota no puede superar 10 GB'],
      validate: { validator: Number.isInteger, message: 'La cuota debe ser un número entero de bytes' },
    },
  },
  {
    // Solo `creadoEn`: el modelo no define fecha de actualizacion del usuario.
    timestamps: { createdAt: 'creadoEn', updatedAt: false },
    // `virtuals` para que almacenamientoDisponible viaje en las respuestas;
    // `id: false` para no duplicar `_id` como `id`.
    id: false,
    toJSON: {
      virtuals: true,
      // Segunda barrera ademas de `select: false`: aunque alguien cargue el
      // hash, nunca se serializa.
      transform(_documento, objeto) {
        delete objeto.passwordHash;
        delete objeto.__v;
        return objeto;
      },
    },
  }
);

// Nunca negativo: si el administrador baja la cuota por debajo de lo usado
// (no lo permite la API, pero podria pasar editando la base), simplemente no
// queda espacio.
esquemaUsuario.virtual('almacenamientoDisponible').get(function () {
  return Math.max(0, this.cuotaAlmacenamiento - this.almacenamientoUsado);
});

// Tercer argumento: nombre exacto de la coleccion, para no depender de la
// pluralizacion automatica de Mongoose (que esta pensada para el ingles).
export const Usuario = mongoose.model('Usuario', esquemaUsuario, 'usuarios');
