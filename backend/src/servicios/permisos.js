import { ErrorProhibido } from '../utilidades/errores.js';

/**
 * Comprobaciones de acceso a carpetas y archivos.
 *
 * Por ahora (Fase 3) solo se mira la PROPIEDAD y el rol: el propietario hace
 * todo y el administrador puede consultar recursos ajenos (seccion 6 del
 * modelo: "Recursos de otros usuarios: consulta"). La Fase 5 amplia este
 * modulo con las otras vias de acceso (compartido directo y heredado de una
 * carpeta ancestro); los servicios ya llaman a estas funciones, asi que no
 * habra que tocarlos.
 */

export function esPropietario(recurso, usuario) {
  return recurso.propietarioId.equals(usuario._id);
}

/** Leer el recurso: propietario o administrador. */
export function exigirConsulta(recurso, usuario) {
  if (esPropietario(recurso, usuario) || usuario.rol === 'ADMINISTRADOR') return;
  throw new ErrorProhibido('No tienes acceso a este recurso');
}

/**
 * Modificar el recurso (crear dentro, renombrar, mover): solo el propietario.
 * El administrador tampoco, porque su permiso sobre recursos ajenos es de
 * consulta; reorganizar las carpetas de otro usuario no es su funcion.
 */
export function exigirPropietario(recurso, usuario, accion = 'modificar este recurso') {
  if (esPropietario(recurso, usuario)) return;
  throw new ErrorProhibido(`Solo el propietario puede ${accion}`);
}
