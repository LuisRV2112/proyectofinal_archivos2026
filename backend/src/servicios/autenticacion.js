import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { Usuario } from '../modelos/index.js';
import { ErrorNoAutenticado, ErrorProhibido } from '../utilidades/errores.js';
import { exigirTexto } from '../utilidades/validacion.js';
import { registrarActividad } from './actividad.js';

/**
 * Hash con el que se compara cuando el username no existe. Comparar igual
 * (aunque se sepa que fallara) hace que la respuesta tarde lo mismo exista o
 * no el usuario; si no, midiendo el tiempo se podria averiguar que usernames
 * son validos. Se calcula una sola vez al cargar el modulo.
 */
const HASH_DE_RELLENO = bcrypt.hashSync('relleno-para-igualar-tiempos', 10);

// El mismo mensaje para "no existe" y "contrasena incorrecta", por la misma
// razon: no revelar que usernames existen.
const MENSAJE_CREDENCIALES = 'Usuario o contraseña incorrectos';

function configuracionJwt() {
  const secreto = process.env.JWT_SECRETO;
  if (!secreto) throw new Error('Falta JWT_SECRETO en el archivo .env (ver .env.ejemplo)');
  return { secreto, expiracion: process.env.JWT_EXPIRACION || '8h' };
}

/** Lo que la API devuelve de un usuario autenticado. */
function perfil(usuario) {
  return {
    id: usuario._id,
    username: usuario.username,
    nombreCompleto: usuario.nombreCompleto,
    email: usuario.email,
    rol: usuario.rol,
  };
}

/**
 * Verifica las credenciales y emite un JWT.
 *
 * El token solo lleva el id (`sub`) y el rol: es firmado pero no cifrado, asi
 * que cualquiera puede leer su contenido; no debe llevar datos sensibles.
 */
export async function iniciarSesion(cuerpo) {
  const username = exigirTexto(cuerpo?.username, 'username').toLowerCase();
  const password = exigirTexto(cuerpo?.password, 'password');

  // passwordHash tiene select:false en el esquema; el login es el unico
  // lugar que lo pide explicitamente.
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

  // Se comprueba DESPUES de la contrasena: a quien no la conoce no se le dice
  // que la cuenta existe y esta desactivada.
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

/**
 * Valida el token y devuelve el usuario ACTUAL desde la base.
 *
 * Se consulta la base en cada peticion en vez de confiar solo en el token
 * (que seria lo "sin estado" puro) porque un JWT no se puede revocar: si el
 * administrador desactiva a alguien o le cambia el rol, el token ya emitido
 * seguiria valiendo hasta expirar. Es una busqueda por _id, la mas barata
 * posible, y a cambio la desactivacion y los cambios de rol tienen efecto
 * inmediato.
 */
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
