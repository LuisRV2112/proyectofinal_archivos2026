import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * Subdocumentos que comparten `carpetas` y `archivos`. Se definen una sola vez
 * para que las reglas (niveles validos, valores por defecto) sean identicas en
 * ambas colecciones.
 */

// Orden de los niveles: un indice mayor da mas permisos. Cuando un usuario
// recibe un recurso por dos vias (directo y heredado de una carpeta), gana el
// de mayor indice.
export const NIVELES_PERMISO = ['LECTURA', 'COMENTARIO', 'EDICION'];

/**
 * Un permiso otorgado sobre un recurso.
 *
 * EMBEBIDO en el recurso, no en una coleccion `permisos` aparte, porque:
 *  - Se lee siempre junto al recurso: la pregunta real es "¿este usuario puede
 *    ver este archivo?", y con el documento en mano se responde sin una
 *    segunda consulta.
 *  - Son pocos por recurso (un archivo se comparte con unas cuantas personas,
 *    no con miles), asi que el array no crece sin control.
 *  - "Compartido conmigo" sigue siendo una consulta indexada gracias al indice
 *    multiclave sobre `compartidoCon.usuarioId`.
 *
 * `_id: false` porque un permiso se identifica por `usuarioId` dentro del
 * recurso; un _id propio no aportaria nada.
 */
export const esquemaPermiso = new Schema(
  {
    // Referencia y no copia del nombre: el usuario cambia por su cuenta.
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

/**
 * Estado de papelera del recurso.
 *
 * EMBEBIDO porque es una relacion uno a uno con el recurso y nunca se consulta
 * por separado: siempre se pregunta "¿este archivo esta en la papelera?" o
 * "¿que recursos de este usuario estan en la papelera?", y ambas cosas se
 * resuelven filtrando la propia coleccion por `eliminado.estado`.
 *
 * Eliminar no borra el documento: solo marca `estado: true`. Asi se puede
 * restaurar, y `padreOriginalId` recuerda a donde volver.
 */
export const esquemaEliminado = new Schema(
  {
    estado: { type: Boolean, required: true, default: false },
    fecha: { type: Date, default: null },
    eliminadoPor: { type: Schema.Types.ObjectId, ref: 'Usuario', default: null },
    // Carpeta en la que estaba al eliminarse (null = raiz del usuario). Si al
    // restaurar esa carpeta ya no existe o sigue en papelera, se restaura a la
    // raiz y se avisa.
    padreOriginalId: { type: Schema.Types.ObjectId, ref: 'Carpeta', default: null },
  },
  { _id: false }
);

/**
 * Definicion lista para usar en los esquemas. El `default` es imprescindible:
 * sin el, Mongoose deja el subdocumento sin definir y los documentos nuevos no
 * tendrian `eliminado.estado: false`, con lo que el filtro de todos los
 * listados ({"eliminado.estado": false}) los dejaria fuera.
 */
export const campoEliminado = {
  type: esquemaEliminado,
  default: () => ({}),
};

/** Opciones de timestamps con los nombres de campo del modelo. */
export const marcasDeTiempo = { createdAt: 'creadoEn', updatedAt: 'actualizadoEn' };

/** Quita campos internos al serializar una respuesta de la API. */
export function limpiarJSON(_documento, objeto) {
  delete objeto.__v;
  return objeto;
}
