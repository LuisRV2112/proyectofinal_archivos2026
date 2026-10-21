import mongoose from 'mongoose';
import { esquemaPermiso, campoEliminado, marcasDeTiempo, limpiarJSON } from './esquemasComunes.js';

const { Schema } = mongoose;

/**
 * Jerarquia de carpetas con el patron ARRAY OF ANCESTORS.
 *
 * Cada carpeta guarda su padre directo (`padreId`) y ademas la lista completa
 * de sus ancestros, de la raiz hacia abajo (`ancestros`). Con eso:
 *
 *  - Todo el subarbol de una carpeta sale en UNA consulta indexada:
 *      db.carpetas.find({ ancestros: carpetaId })
 *    sin recursion. Es lo que necesitan mover una carpeta y la papelera en
 *    cascada.
 *  - Los ancestros (la "miga de pan") ya estan en el documento, sin consultas.
 *  - Detectar ciclos al mover A dentro de B es mirar si A esta en B.ancestros.
 *
 * El precio: al mover una carpeta hay que reescribir `ancestros` y `ruta` de
 * todo su subarbol. Se acepta porque mover es raro y listar es constante.
 *
 * Por que no solo `padreId` (Parent References): obtener el subarbol obligaria
 * a recorrer el arbol nivel por nivel con una consulta por nivel, o a usar
 * $graphLookup en cada operacion.
 */
const esquemaCarpeta = new Schema(
  {
    nombre: {
      type: String,
      required: [true, 'El nombre de la carpeta es obligatorio'],
      trim: true,
      maxlength: [100, 'El nombre de la carpeta no puede superar 100 caracteres'],
      // La barra separa niveles en `ruta`; permitirla en un nombre haria la
      // ruta ambigua.
      match: [/^[^/\\]+$/, 'El nombre de la carpeta no puede contener / ni \\'],
    },
    // Referencia: el propietario es un usuario que cambia por su cuenta;
    // copiar su nombre aqui obligaria a actualizarlo en todas sus carpetas.
    propietarioId: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true },
    // null = carpeta en la raiz del usuario.
    padreId: { type: Schema.Types.ObjectId, ref: 'Carpeta', default: null },
    // De la raiz al padre directo; [] para una carpeta raiz.
    ancestros: { type: [{ type: Schema.Types.ObjectId, ref: 'Carpeta' }], default: [] },
    // "/Contratos/Clientes": redundante con `ancestros`, pero permite mostrar
    // la ubicacion sin cargar cada ancestro para leer su nombre.
    ruta: { type: String, required: true },
    // EMBEBIDO: ver esquemaPermiso. Compartir una carpeta da acceso a todo su
    // contenido (herencia hacia abajo via `ancestros`).
    compartidoCon: { type: [esquemaPermiso], default: [] },
    // EMBEBIDO: ver esquemaEliminado.
    eliminado: campoEliminado,
  },
  {
    timestamps: marcasDeTiempo,
    toJSON: { transform: limpiarJSON },
  }
);

// --- Indices (tabla 4.4 del modelo) ---

// Listar el contenido de una carpeta: "subcarpetas de X del usuario Y". El
// orden propietario -> padre sirve tambien para "todas las carpetas de Y".
esquemaCarpeta.index({ propietarioId: 1, padreId: 1 });
// Subarbol completo. Al ser un array, MongoDB crea un indice multiclave: una
// entrada por cada ancestro, asi que {ancestros: X} usa el indice.
esquemaCarpeta.index({ ancestros: 1 });
// "Compartido conmigo" y la comprobacion de permisos heredados.
esquemaCarpeta.index({ 'compartidoCon.usuarioId': 1 });
// Papelera, y excluir lo eliminado de los listados normales.
esquemaCarpeta.index({ 'eliminado.estado': 1 });

export const Carpeta = mongoose.model('Carpeta', esquemaCarpeta, 'carpetas');
