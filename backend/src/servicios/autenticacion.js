import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { Usuario } from '../modelos/index.js';
import { ErrorNoAutenticado, ErrorProhibido } from '../utilidades/errores.js';
import { exigirTexto } from '../utilidades/validacion.js';
import { registrarActividad } from './actividad.js';

// Se compara contra este hash si el username no existe, para que la
// respuesta tarde lo mismo y no se pueda saber que usuarios existen.
const HASH_DE_RELLENO = bcrypt.hashSync('relleno-para-igualar-tiempos', 10);

// Mismo mensaje en ambos casos, por la misma razon.
const MENSAJE_CREDENCIALES = 'Usuario o contraseña incorrectos';

function configuracionJwt() {
  const secreto = process.env.JWT_SECRETO;
  if (!secreto) throw new Error('Falta JWT_SECRETO en el archivo .env (ver .env.ejemplo)');
  return { secreto, expiracion: process.env.JWT_EXPIRACION || '8h' };
}

function perfil(usuario) {
  return {
    id: usuario._id,
    username: usuario.username,
    nombreCompleto: usuario.nombreCompleto,
    email: usuario.email,
    rol: usuario.rol,
  };
}

// El JWT va firmado pero no cifrado: solo lleva el id y el rol.
export async function iniciarSesion(cuerpo) {
  const username = exigirTexto(cuerpo?.username, 'username').toLowerCase();
  const password = exigirTexto(cuerpo?.password, 'password');

  // Unico lugar que pide passwordHash.
  const usuario = await Usuario.findOne({ username }).select('+passwordHash');
  const coincide = await bcrypt.compare(password, usuario?.passwordHash ?? HASH_DE_RELLENO);

  if (!usuario || !coincide) {
    await registrarActividad({
      usuarioId: usuario?._id,
      accion: 'LOGIN_FALLIDO',
      recursoTipo: 'USUARIO',
      recursoId: usuario?._id,
      recursoNombre: username,
      detalle: usuario ? 'Contraseña incorrecta' : 'Usuario inexistente',
    });
    throw new ErrorNoAutenticado(MENSAJE_CREDENCIALES);
  }

  // Despues de la contrasena, para no revelar la cuenta a quien no la sabe.
  if (!usuario.activo) {
    await registrarActividad({
      usuarioId: usuario._id,
      accion: 'LOGIN_FALLIDO',
      recursoTipo: 'USUARIO',
      recursoId: usuario._id,
      recursoNombre: usuario.username,
      detalle: 'Cuenta desactivada',
    });
    throw new ErrorProhibido('La cuenta está desactivada. Contacta al administrador');
  }

  const { secreto, expiracion } = configuracionJwt();
  const token = jwt.sign({ rol: usuario.rol }, secreto, { subject: usuario._id.toString(), expiresIn: expiracion });

  await registrarActividad({
    usuarioId: usuario._id,
    accion: 'LOGIN',
    recursoTipo: 'USUARIO',
    recursoId: usuario._id,
    recursoNombre: usuario.username,
    detalle: 'Inicio de sesión',
  });

  return { token, expiraEn: expiracion, ...perfil(usuario) };
}

// Se busca el usuario en cada peticion porque un JWT no se puede revocar:
// asi desactivar o cambiar el rol tiene efecto inmediato. Es una busqueda por _id.
export async function usuarioDesdeToken(token) {
  const { secreto } = configuracionJwt();
  let datos;
  try {
    datos = jwt.verify(token, secreto);
  } catch (error) {
    const mensaje = error.name === 'TokenExpiredError' ? 'La sesión expiró' : 'Token inválido';
    throw new ErrorNoAutenticado(mensaje, 'Inicia sesión de nuevo');
  }

  const usuario = await Usuario.findById(datos.sub);
  if (!usuario) throw new ErrorNoAutenticado('Token inválido', 'El usuario ya no existe');
  if (!usuario.activo) throw new ErrorNoAutenticado('La cuenta está desactivada');
  return usuario;
}

export { perfil };
