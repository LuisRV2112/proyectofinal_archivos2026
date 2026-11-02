import { Carpeta, NIVELES_PERMISO } from '../modelos/index.js';
import { ErrorProhibido } from '../utilidades/errores.js';

// Acceso a un recurso:
//   1. propietario
//   2. compartido directo (compartidoCon del recurso)
//   3. heredado de una carpeta ancestro
//   4. administrador -> LECTURA
// Si llega por varias vias gana el nivel mas alto.
//
// Se hereda hacia abajo para no copiar el permiso en cada archivo. Las
// carpetas posibles ya estan en recurso.ancestros: una sola consulta.
//
// LECTURA y COMENTARIO: ver y descargar. EDICION: ademas renombrar.
// Crear dentro, mover, eliminar y compartir: solo el propietario.

// PROPIETARIO queda por encima de todos.
const RANGO = { ...Object.fromEntries(NIVELES_PERMISO.map((n, i) => [n, i + 1])), PROPIETARIO: NIVELES_PERMISO.length + 1 };

const mayor = (a, b) => (!a ? b : !b ? a : RANGO[a.nivel] >= RANGO[b.nivel] ? a : b);

export function esPropietario(recurso, usuario) {
  return recurso.propietarioId.equals(usuario._id);
}

function permisoDe(documento, usuario) {
  return documento.compartidoCon?.find((p) => p.usuarioId.equals(usuario._id));
}

// Devuelve { nivel, via } o null si no tiene acceso.
export async function nivelDeAcceso(recurso, usuario) {
  if (esPropietario(recurso, usuario)) return { nivel: 'PROPIETARIO', via: 'propietario' };

  let acceso = null;

  // Directo: esta embebido, no hace falta consultar.
  const directo = permisoDe(recurso, usuario);
  if (directo) acceso = { nivel: directo.nivel, via: 'directo' };

  // Heredado: de los ancestros, los que esten compartidos con el usuario.
  if (recurso.ancestros?.length) {
    const heredables = await Carpeta.find(
      { _id: { $in: recurso.ancestros }, 'compartidoCon.usuarioId': usuario._id, 'eliminado.estado': false },
      { ruta: 1, compartidoCon: 1 }
    ).lean();
    for (const carpeta of heredables) {
      acceso = mayor(acceso, { nivel: permisoDe(carpeta, usuario).nivel, via: 'heredado', desde: carpeta.ruta });
    }
  }

  // Administrador: al menos LECTURA.
  if (usuario.rol === 'ADMINISTRADOR') acceso = mayor(acceso, { nivel: 'LECTURA', via: 'administrador' });

  return acceso;
}

// 403 si no alcanza. Devuelve el acceso para usarlo en el historial.
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

export function exigirPropietario(recurso, usuario, accion = 'modificar este recurso') {
  if (esPropietario(recurso, usuario)) return;
  throw new ErrorProhibido(`Solo el propietario puede ${accion}`);
}

// Texto para el historial.
export function describirAcceso(acceso) {
  if (acceso.via === 'propietario') return 'como propietario';
  if (acceso.via === 'administrador') return 'como administrador';
  if (acceso.via === 'heredado') return `con permiso de ${acceso.nivel} (heredado de ${acceso.desde})`;
  return `con permiso de ${acceso.nivel}`;
}

// Para listados (busqueda, compartido conmigo). Usa el indice compartidoCon.usuarioId.
export async function carpetasCompartidasCon(usuario) {
  return Carpeta.find(
    { 'compartidoCon.usuarioId': usuario._id, 'eliminado.estado': false },
    { _id: 1, ruta: 1, propietarioId: 1, compartidoCon: 1 }
  ).lean();
}
