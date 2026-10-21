import { usuarioDesdeToken } from '../servicios/autenticacion.js';
import { ErrorNoAutenticado, ErrorProhibido } from '../utilidades/errores.js';

/**
 * Exige `Authorization: Bearer <token>` y deja el usuario en `req.usuario`.
 * Express 5 propaga solo los errores de los middleware async, asi que basta
 * con lanzar: el middleware de errores responde 401.
 */
export async function autenticar(req, _res, next) {
  const cabecera = req.get('Authorization') ?? '';
  const [esquema, token] = cabecera.split(' ');
  if (esquema !== 'Bearer' || !token) {
    throw new ErrorNoAutenticado('Se requiere iniciar sesión', 'Falta la cabecera Authorization: Bearer <token>');
  }
  req.usuario = await usuarioDesdeToken(token);
  next();
}

/**
 * Restringe una ruta a ciertos roles. Va despues de `autenticar`.
 * Responde 403 (no 401): el usuario si esta identificado, pero su rol no
 * alcanza.
 */
export function exigirRol(...roles) {
  return (req, _res, next) => {
    if (!req.usuario) throw new ErrorNoAutenticado();
    if (!roles.includes(req.usuario.rol)) {
      throw new ErrorProhibido('No tienes permiso para realizar esta operación', `Requiere rol: ${roles.join(' o ')}`);
    }
    next();
  };
}
