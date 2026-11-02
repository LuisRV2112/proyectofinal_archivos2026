import { usuarioDesdeToken } from '../servicios/autenticacion.js';
import { ErrorNoAutenticado, ErrorProhibido } from '../utilidades/errores.js';

// Lee el Bearer token y deja el usuario en req.usuario.
// Express 5 pasa los errores async al manejador, basta con lanzar.
export async function autenticar(req, _res, next) {
  const cabecera = req.get('Authorization') ?? '';
  const [esquema, token] = cabecera.split(' ');
  if (esquema !== 'Bearer' || !token) {
    throw new ErrorNoAutenticado('Se requiere iniciar sesión', 'Falta la cabecera Authorization: Bearer <token>');
  }
  req.usuario = await usuarioDesdeToken(token);
  next();
}

// Va despues de autenticar. 403 porque ya se sabe quien es.
export function exigirRol(...roles) {
  return (req, _res, next) => {
    if (!req.usuario) throw new ErrorNoAutenticado();
    if (!roles.includes(req.usuario.rol)) {
      throw new ErrorProhibido('No tienes permiso para realizar esta operación', `Requiere rol: ${roles.join(' o ')}`);
    }
    next();
  };
}
