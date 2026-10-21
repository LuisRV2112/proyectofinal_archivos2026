import { Carpeta, NIVELES_PERMISO } from '../modelos/index.js';
import { ErrorProhibido } from '../utilidades/errores.js';

/**
 * Control de acceso a carpetas y archivos (regla 5.2 del modelo).
 *
 * Un usuario accede a un recurso por cualquiera de estas vias:
 *   1. Es su PROPIETARIO                          -> puede todo
 *   2. Esta en el `compartidoCon` del recurso     -> el nivel otorgado
 *   3. Esta en el `compartidoCon` de una carpeta  -> el nivel otorgado (HERENCIA)
 *      ANCESTRO del recurso
 *   4. Es ADMINISTRADOR                           -> LECTURA (consulta)
 *
 * Si llega por varias vias, GANA EL NIVEL MAS ALTO. Ejemplo del seed: cperez
 * tiene LECTURA heredada de /Administracion/Manuales y EDICION directa en un
 * archivo de esa carpeta; sobre ese archivo su nivel es EDICION.
 *
 * Por que los permisos se HEREDAN hacia abajo: compartir una carpeta da
 * acceso a todo lo que contiene, a cualquier profundidad, incluido lo que se
 * agregue despues. Es lo que espera cualquiera que haya usado un gestor
 * documental, y evita tener que copiar el permiso en cada archivo (copias que
 * habria que mantener al mover, subir o revocar).
 *
 * Por que no cuesta nada con Array of Ancestors: las carpetas de las que un
 * recurso puede heredar ya estan listadas en su propio `ancestros`, asi que
 * la herencia se resuelve con UNA consulta, sin recorrer el arbol hacia
 * arriba.
 *
 * Que habilita cada nivel:
 *   LECTURA    ver metadatos y contenido, descargar, navegar dentro
 *   COMENTARIO lo mismo que LECTURA (el sistema no tiene comentarios aun; el
 *              nivel existe en el modelo y se respeta en el orden)
 *   EDICION    ademas, renombrar
 * Solo el propietario crea dentro, mueve, envia a la papelera y comparte:
 * esas operaciones reorganizan SU arbol y SU espacio de almacenamiento.
 */

// Rango numerico de cada nivel para compararlos. PROPIETARIO esta por encima
// de todos.
const RANGO = { ...Object.fromEntries(NIVELES_PERMISO.map((n, i) => [n, i + 1])), PROPIETARIO: NIVELES_PERMISO.length + 1 };

const mayor = (a, b) => (!a ? b : !b ? a : RANGO[a.nivel] >= RANGO[b.nivel] ? a : b);

export function esPropietario(recurso, usuario) {
  return recurso.propietarioId.equals(usuario._id);
}

/** El permiso de `usuario` en el compartidoCon de un documento, o undefined. */
function permisoDe(documento, usuario) {
  return documento.compartidoCon?.find((p) => p.usuarioId.equals(usuario._id));
}

/**
 * Nivel efectivo de un usuario sobre un recurso (carpeta o archivo).
 *
 * @returns {{nivel, via}} o null si no tiene acceso.
 *   nivel: PROPIETARIO | EDICION | COMENTARIO | LECTURA
 *   via:   'propietario' | 'directo' | 'heredado' | 'administrador'
 *          (+ `desde`: la ruta de la carpeta de la que hereda)
 */
export async function nivelDeAcceso(recurso, usuario) {
  if (esPropietario(recurso, usuario)) return { nivel: 'PROPIETARIO', via: 'propietario' };

  let acceso = null;

  // Via 2: compartido directamente. Ya esta en el documento (permisos
  // EMBEBIDOS): no hace falta otra consulta.
  const directo = permisoDe(recurso, usuario);
  if (directo) acceso = { nivel: directo.nivel, via: 'directo' };

  // Via 3: heredado. Las candidatas son exactamente las carpetas de
  // `recurso.ancestros` (en un archivo incluye su propia carpeta). Se buscan
  // por _id y se piden solo las compartidas con el usuario; se filtra por _id
  // y no por "todas las carpetas compartidas conmigo" porque `ancestros`
  // tiene a lo sumo unos pocos elementos y el indice _id es el mas selectivo.
  if (recurso.ancestros?.length) {
    const heredables = await Carpeta.find(
      { _id: { $in: recurso.ancestros }, 'compartidoCon.usuarioId': usuario._id, 'eliminado.estado': false },
      { ruta: 1, compartidoCon: 1 }
    ).lean();
    for (const carpeta of heredables) {
      acceso = mayor(acceso, { nivel: permisoDe(carpeta, usuario).nivel, via: 'heredado', desde: carpeta.ruta });
    }
  }

  // Via 4: el administrador puede consultar cualquier recurso. Si ademas se
  // lo compartieron con un nivel mayor, gana ese.
  if (usuario.rol === 'ADMINISTRADOR') acceso = mayor(acceso, { nivel: 'LECTURA', via: 'administrador' });

  return acceso;
}

/**
 * Exige al menos `nivelMinimo` y devuelve el acceso (para que el servicio
 * sepa por que via entro, p. ej. para el historial). 403 si no alcanza.
 */
export async function exigirNivel(recurso, usuario, nivelMinimo = 'LECTURA') {
  const acceso = await nivelDeAcceso(recurso, usuario);
  if (!acceso) throw new ErrorProhibido('No tienes acceso a este recurso');
  if (RANGO[acceso.nivel] < RANGO[nivelMinimo]) {
    throw new ErrorProhibido(
      'Tu nivel de permiso no alcanza para esta operación',
      `Requiere ${nivelMinimo}; tienes ${acceso.nivel}`
    );
  }
  return acceso;
}

/** Solo el propietario (crear dentro, mover, papelera). */
export function exigirPropietario(recurso, usuario, accion = 'modificar este recurso') {
  if (esPropietario(recurso, usuario)) return;
  throw new ErrorProhibido(`Solo el propietario puede ${accion}`);
}

/** Texto para el historial: "como propietario", "con permiso de EDICION (heredado de /Actas)". */
export function describirAcceso(acceso) {
  if (acceso.via === 'propietario') return 'como propietario';
  if (acceso.via === 'administrador') return 'como administrador';
  if (acceso.via === 'heredado') return `con permiso de ${acceso.nivel} (heredado de ${acceso.desde})`;
  return `con permiso de ${acceso.nivel}`;
}

/**
 * Carpetas activas compartidas DIRECTAMENTE con el usuario. Es la consulta de
 * la herencia "al reves": sirve para listados (busqueda, "compartido
 * conmigo"), donde no se parte de un recurso sino que hay que encontrar todo
 * lo accesible. Usa el indice {"compartidoCon.usuarioId": 1}.
 */
export async function carpetasCompartidasCon(usuario) {
  return Carpeta.find(
    { 'compartidoCon.usuarioId': usuario._id, 'eliminado.estado': false },
    { _id: 1, ruta: 1, propietarioId: 1, compartidoCon: 1 }
  ).lean();
}
