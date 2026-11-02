import { Usuario } from '../../modelos/index.js';
import { ErrorNoEncontrado, ErrorProhibido } from '../../utilidades/errores.js';
import { exigirObjectId } from '../../utilidades/validacion.js';

// ?usuarioId: el usuario normal solo el suyo, el administrador cualquiera.
export async function leerUsuarioObjetivo(consulta, usuario, mensajeProhibido) {
  if (consulta.usuarioId === undefined) return usuario;
  const id = exigirObjectId(consulta.usuarioId, 'usuarioId');
  if (!id.equals(usuario._id) && usuario.rol !== 'ADMINISTRADOR') {
    throw new ErrorProhibido(mensajeProhibido);
  }
  const objetivo = await Usuario.findById(id, { username: 1, nombreCompleto: 1 });
  if (!objetivo) throw new ErrorNoEncontrado('Usuario no encontrado');
  return objetivo;
}
