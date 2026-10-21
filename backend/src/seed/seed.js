/**
 * Carga inicial: `npm run seed`.
 *
 * En vez de insertar documentos ya armados, REPRODUCE la linea de tiempo de
 * datos.js: crea usuarios, carpetas y archivos, los comparte, los descarga, los
 * mueve y los manda a la papelera en orden cronologico, aplicando en cada paso
 * las mismas reglas de negocio que tendra la API. Cada operacion deja su
 * entrada en `actividad` con su fecha simulada.
 *
 * Asi la consistencia no depende de haber escrito bien cada dato a mano:
 *  - `ancestros` y `ruta` se calculan siempre a partir del padre real.
 *  - `tamano` lo devuelve GridFS al subir el contenido.
 *  - `almacenamientoUsado` se suma y resta en cada operacion y al final se
 *    recalcula con una agregacion para comprobar que cuadra.
 *  - Una operacion imposible (descargar sin permiso, hermanos con el mismo
 *    nombre, mover creando un ciclo) detiene la carga con un error.
 *
 * Es repetible: vacia las colecciones y GridFS antes de cargar.
 */
import 'dotenv/config';
import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import { conectarBaseDatos, desconectarBaseDatos } from '../config/baseDatos.js';
import { obtenerBucket, subirContenido, eliminarContenido, NOMBRE_BUCKET } from '../config/gridfs.js';
import { Usuario, Carpeta, Archivo, Actividad, MIME_POR_EXTENSION, NIVELES_PERMISO } from '../modelos/index.js';
import { formatearBytes } from '../utilidades/formato.js';
import {
  USUARIOS, CARPETAS, ARCHIVOS, LINEA_DE_TIEMPO, CONTRASENA_PRUEBA, INICIO_SIMULACION, FIN_SIMULACION,
} from './datos.js';

// Los indices se crean de forma explicita despues de vaciar (ver vaciarBase).
// Con autoIndex activo, Mongoose los lanzaria al conectar y competirian con el
// borrado de las colecciones.
mongoose.set('autoIndex', false);

const COSTO_BCRYPT = 10;
// Guatemala esta en UTC-6 todo el ano (sin horario de verano).
const DESFASE_UTC_HORAS = 6;
const JORNADA = { inicioMinutos: 8 * 60, duracionMinutos: 9.5 * 60 }; // 8:00 a 17:30

// ---------------------------------------------------------------------------
// Utilidades de la simulacion
// ---------------------------------------------------------------------------

// Generador pseudoaleatorio con semilla fija (mulberry32): las horas varian de
// forma natural pero el seed produce exactamente lo mismo en cada ejecucion.
function crearAleatorio(semilla) {
  let estado = semilla >>> 0;
  return () => {
    estado = (estado + 0x6d2b79f5) >>> 0;
    let t = estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const aleatorio = crearAleatorio(2026);

function fechaGuatemala(anio, mes, dia, minutosDelDia) {
  return new Date(Date.UTC(anio, mes, dia, DESFASE_UTC_HORAS, minutosDelDia));
}

/**
 * Reparte `cantidad` operaciones dentro del horario laboral del mes,
 * conservando su orden: el tiempo laboral disponible se divide en tramos
 * iguales y cada operacion cae en un punto al azar de su tramo.
 */
function repartirEnMes(mesTexto, cantidad) {
  const [anio, mes] = mesTexto.split('-').map(Number);
  const inicio = new Date(`${INICIO_SIMULACION}T00:00:00Z`);
  const fin = new Date(`${FIN_SIMULACION}T00:00:00Z`);
  const diasLaborables = [];
  for (let dia = 1; dia <= 31; dia++) {
    const fecha = new Date(Date.UTC(anio, mes - 1, dia));
    if (fecha.getUTCMonth() !== mes - 1) break;
    const diaSemana = fecha.getUTCDay();
    if (diaSemana === 0 || diaSemana === 6 || fecha < inicio || fecha > fin) continue;
    diasLaborables.push(dia);
  }

  const minutosDisponibles = diasLaborables.length * JORNADA.duracionMinutos;
  const tramo = minutosDisponibles / cantidad;
  return Array.from({ length: cantidad }, (_, i) => {
    const desplazamiento = Math.floor((i + 0.1 + 0.8 * aleatorio()) * tramo);
    const dia = diasLaborables[Math.floor(desplazamiento / JORNADA.duracionMinutos)];
    const minutos = JORNADA.inicioMinutos + (desplazamiento % JORNADA.duracionMinutos);
    return fechaGuatemala(anio, mes - 1, dia, minutos);
  });
}

const carpetaPadreDe = (clave) => clave.slice(0, clave.lastIndexOf('/')) || null;
const nombreDe = (clave) => clave.slice(clave.lastIndexOf('/') + 1);
const extensionDe = (nombre) => nombre.slice(nombre.lastIndexOf('.') + 1).toLowerCase();
const diaGuatemala = (fecha) => new Date(fecha.getTime() - DESFASE_UTC_HORAS * 3600_000).toISOString().slice(0, 10);

class ErrorSimulacion extends Error {}

// ---------------------------------------------------------------------------
// Estado de la simulacion
// ---------------------------------------------------------------------------

const usuarios = new Map(); // username -> documento Usuario
const carpetas = new Map(); // clave (ruta final) -> documento Carpeta
const archivos = new Map(); // clave (nombre final) -> documento Archivo
const especificaciones = new Map(ARCHIVOS.map((a) => [a.nombre, a]));
const historial = [];
const ultimoLogin = new Map(); // username -> dia del ultimo login

function usuario(username) {
  const u = usuarios.get(username);
  if (!u) throw new ErrorSimulacion(`El usuario "${username}" no existe todavia`);
  return u;
}
function carpeta(clave) {
  const c = carpetas.get(clave);
  if (!c) throw new ErrorSimulacion(`La carpeta "${clave}" no existe todavia`);
  return c;
}
function archivo(clave) {
  const a = archivos.get(clave);
  if (!a) throw new ErrorSimulacion(`El archivo "${clave}" no existe`);
  return a;
}
const propietarioDeArchivo = (clave) => especificaciones.get(clave).propietario;

function registrar(actor, accion, recursoTipo, recurso, detalle, fecha) {
  historial.push({
    usuarioId: actor._id,
    accion,
    recursoTipo,
    recursoId: recurso._id,
    recursoNombre: recursoTipo === 'USUARIO' ? recurso.username : recurso.nombre,
    detalle,
    fecha,
  });
}

/**
 * Un usuario inicia sesion la primera vez que actua en un dia: la entrada de
 * LOGIN queda unos minutos antes de su primera operacion de ese dia.
 */
function registrarLoginSiCorresponde(actor, fecha) {
  const dia = diaGuatemala(fecha);
  if (ultimoLogin.get(actor.username) === dia) return;
  ultimoLogin.set(actor.username, dia);
  const minutosAntes = 2 + Math.floor(aleatorio() * 8);
  historial.push({
    usuarioId: actor._id,
    accion: 'LOGIN',
    recursoTipo: 'USUARIO',
    recursoId: actor._id,
    recursoNombre: actor.username,
    detalle: 'Inicio de sesión',
    fecha: new Date(fecha.getTime() - minutosAntes * 60_000),
  });
}

/** Rechaza un nombre que ya usa un hermano no eliminado (regla 5.1 y 5.5). */
function validarNombreLibre(coleccion, campoPadre, padreId, propietarioId, nombre, excluirId) {
  const choca = [...coleccion.values()].some(
    (d) =>
      !d._id.equals(excluirId ?? null) &&
      !d.eliminado.estado &&
      d.propietarioId.equals(propietarioId) &&
      String(d[campoPadre] ?? null) === String(padreId ?? null) &&
      d.nombre.toLowerCase() === nombre.toLowerCase()
  );
  if (choca) throw new ErrorSimulacion(`Ya existe "${nombre}" en esa carpeta`);
}

/**
 * Nivel con que `actor` accede a un archivo, o null si no tiene acceso. Mismas
 * reglas que tendra la API (seccion 5.2): propietario, permiso directo,
 * permiso heredado de una carpeta ancestro, o administrador. Si llega por
 * varias vias gana el nivel mas alto.
 */
function nivelDeAcceso(actor, arch) {
  if (arch.propietarioId.equals(actor._id)) return 'PROPIETARIO';
  const candidatos = [];
  const directo = arch.compartidoCon.find((p) => p.usuarioId.equals(actor._id));
  if (directo) candidatos.push(directo.nivel);
  for (const c of carpetas.values()) {
    if (!arch.ancestros.some((id) => id.equals(c._id))) continue;
    const heredado = c.compartidoCon.find((p) => p.usuarioId.equals(actor._id));
    if (heredado) candidatos.push(heredado.nivel);
  }
  if (candidatos.length) {
    return candidatos.reduce((a, b) => (NIVELES_PERMISO.indexOf(a) >= NIVELES_PERMISO.indexOf(b) ? a : b));
  }
  if (actor.rol === 'ADMINISTRADOR') return 'ADMINISTRADOR';
  return null;
}

// Todos los saves llevan timestamps:false: las fechas son las de la
// simulacion, no la hora en que corre el script.
const guardar = (documento) => documento.save({ timestamps: false });

// ---------------------------------------------------------------------------
// Operaciones
// ---------------------------------------------------------------------------

const operaciones = {
  async CREAR_USUARIO(op, fecha) {
    const admin = usuario(op.actor);
    const datos = USUARIOS.find((u) => u.username === op.username);
    const nuevo = await crearUsuario(datos, fecha);
    registrar(admin, 'CREAR_USUARIO', 'USUARIO', nuevo, `Creado con rol ${nuevo.rol}`, fecha);
    return admin;
  },

  async CREAR_CARPETA(op, fecha) {
    const propietario = usuario(CARPETAS[op.clave]);
    const clavePadre = op.padreInicial ?? carpetaPadreDe(op.clave);
    const padre = clavePadre ? carpeta(clavePadre) : null;
    const nombre = nombreDe(op.clave);
    validarNombreLibre(carpetas, 'padreId', padre?._id, propietario._id, nombre);

    const nueva = new Carpeta({
      nombre,
      propietarioId: propietario._id,
      padreId: padre?._id ?? null,
      // Array of Ancestors: los del padre mas el propio padre.
      ancestros: padre ? [...padre.ancestros, padre._id] : [],
      ruta: padre ? `${padre.ruta}/${nombre}` : `/${nombre}`,
      creadoEn: fecha,
      actualizadoEn: fecha,
    });
    await guardar(nueva);
    carpetas.set(op.clave, nueva);
    registrar(propietario, 'CREAR_CARPETA', 'CARPETA', nueva, `Creada en ${padre?.ruta ?? 'la raíz'}`, fecha);
    return propietario;
  },

  async SUBIR(op, fecha) {
    const especificacion = especificaciones.get(op.clave);
    const propietario = usuario(especificacion.propietario);
    const claveCarpeta = op.carpetaInicial ?? especificacion.carpeta;
    const destino = claveCarpeta ? carpeta(claveCarpeta) : null;
    const nombre = op.nombreInicial ?? especificacion.nombre;
    const extension = extensionDe(nombre);
    validarNombreLibre(archivos, 'carpetaId', destino?._id, propietario._id, nombre);

    // El contenido va a GridFS; el tamano que se guarda es el que GridFS
    // reporta, no uno calculado aparte.
    const contenido = Buffer.from(especificacion.contenido(), 'utf8');
    const { gridfsId, tamano } = await subirContenido(contenido, nombre, {
      propietarioId: propietario._id,
      mimeType: MIME_POR_EXTENSION[extension],
    });
    // GridFS sella uploadDate con la hora real; se alinea con la simulada.
    await mongoose.connection.db
      .collection(`${NOMBRE_BUCKET}.files`)
      .updateOne({ _id: gridfsId }, { $set: { uploadDate: fecha } });

    const nuevo = new Archivo({
      nombre,
      extension,
      mimeType: MIME_POR_EXTENSION[extension],
      tamano,
      propietarioId: propietario._id,
      carpetaId: destino?._id ?? null,
      // Ancestros de la carpeta mas la propia carpeta (ver modelo Archivo).
      ancestros: destino ? [...destino.ancestros, destino._id] : [],
      gridfsId,
      etiquetas: especificacion.etiquetas,
      creadoEn: fecha,
      actualizadoEn: fecha,
    });
    await guardar(nuevo);
    archivos.set(op.clave, nuevo);

    propietario.almacenamientoUsado += tamano;
    await guardar(propietario);

    registrar(propietario, 'SUBIR', 'ARCHIVO', nuevo, `Subido a ${destino?.ruta ?? 'la raíz'} (${formatearBytes(tamano)})`, fecha);
    return propietario;
  },

  async RENOMBRAR(op, fecha) {
    const arch = archivo(op.clave);
    const propietario = usuario(propietarioDeArchivo(op.clave));
    const nuevoNombre = especificaciones.get(op.clave).nombre;
    validarNombreLibre(archivos, 'carpetaId', arch.carpetaId, arch.propietarioId, nuevoNombre, arch._id);

    const anterior = arch.nombre;
    arch.nombre = nuevoNombre;
    arch.actualizadoEn = fecha;
    await guardar(arch);
    // El filename de contenido.files se mantiene igual al nombre visible.
    await obtenerBucket().rename(arch.gridfsId, nuevoNombre);
    registrar(propietario, 'RENOMBRAR', 'ARCHIVO', arch, `De "${anterior}" a "${nuevoNombre}"`, fecha);
    return propietario;
  },

  async MOVER_ARCHIVO(op, fecha) {
    const arch = archivo(op.clave);
    const propietario = usuario(propietarioDeArchivo(op.clave));
    const claveDestino = especificaciones.get(op.clave).carpeta;
    const destino = claveDestino ? carpeta(claveDestino) : null;
    validarNombreLibre(archivos, 'carpetaId', destino?._id, arch.propietarioId, arch.nombre, arch._id);

    const origen = [...carpetas.values()].find((c) => c._id.equals(arch.carpetaId));
    arch.carpetaId = destino?._id ?? null;
    arch.ancestros = destino ? [...destino.ancestros, destino._id] : [];
    arch.actualizadoEn = fecha;
    await guardar(arch);
    registrar(propietario, 'MOVER', 'ARCHIVO', arch, `De ${origen?.ruta ?? 'la raíz'} a ${destino?.ruta ?? 'la raíz'}`, fecha);
    return propietario;
  },

  async MOVER_CARPETA(op, fecha) {
    const movida = carpeta(op.clave);
    const propietario = usuario(CARPETAS[op.clave]);
    const claveDestino = carpetaPadreDe(op.clave);
    const destino = claveDestino ? carpeta(claveDestino) : null;

    // Sin ciclos (regla 5.1): no se puede mover una carpeta dentro de si misma
    // ni de una de sus descendientes.
    if (destino && (destino._id.equals(movida._id) || destino.ancestros.some((id) => id.equals(movida._id)))) {
      throw new ErrorSimulacion(`Mover "${movida.ruta}" a "${destino.ruta}" crearia un ciclo`);
    }
    validarNombreLibre(carpetas, 'padreId', destino?._id, movida.propietarioId, movida.nombre, movida._id);

    const rutaAnterior = movida.ruta;
    const ancestrosNuevos = destino ? [...destino.ancestros, destino._id] : [];
    const rutaNueva = destino ? `${destino.ruta}/${movida.nombre}` : `/${movida.nombre}`;

    // Reemplaza el tramo de ancestros que va "por encima" de la carpeta movida
    // y conserva el que va desde ella hacia abajo.
    const reubicar = (ancestros) => {
      const posicion = ancestros.findIndex((id) => id.equals(movida._id));
      return [...ancestrosNuevos, ...ancestros.slice(posicion)];
    };

    movida.padreId = destino?._id ?? null;
    movida.ancestros = ancestrosNuevos;
    movida.ruta = rutaNueva;
    movida.actualizadoEn = fecha;
    await guardar(movida);

    // Es el precio del patron Array of Ancestors: todo el subarbol se reescribe.
    let afectados = 0;
    for (const sub of carpetas.values()) {
      if (!sub.ancestros.some((id) => id.equals(movida._id))) continue;
      sub.ancestros = reubicar(sub.ancestros);
      sub.ruta = rutaNueva + sub.ruta.slice(rutaAnterior.length);
      sub.actualizadoEn = fecha;
      await guardar(sub);
      afectados++;
    }
    for (const arch of archivos.values()) {
      if (!arch.ancestros.some((id) => id.equals(movida._id))) continue;
      arch.ancestros = reubicar(arch.ancestros);
      arch.actualizadoEn = fecha;
      await guardar(arch);
      afectados++;
    }
    registrar(propietario, 'MOVER', 'CARPETA', movida, `De ${rutaAnterior} a ${rutaNueva} (${afectados} elementos reubicados)`, fecha);
    return propietario;
  },

  async COMPARTIR(op, fecha) {
    const recurso = op.recursoTipo === 'CARPETA' ? carpeta(op.clave) : archivo(op.clave);
    const propietario = usuario(op.recursoTipo === 'CARPETA' ? CARPETAS[op.clave] : propietarioDeArchivo(op.clave));
    const destinatario = usuario(op.con);
    if (destinatario._id.equals(propietario._id)) throw new ErrorSimulacion('No se comparte un recurso con su propietario');
    if (recurso.compartidoCon.some((p) => p.usuarioId.equals(destinatario._id))) {
      throw new ErrorSimulacion(`"${recurso.nombre}" ya esta compartido con ${op.con}`);
    }

    recurso.compartidoCon.push({ usuarioId: destinatario._id, nivel: op.nivel, otorgadoPor: propietario._id, otorgadoEn: fecha });
    recurso.actualizadoEn = fecha;
    await guardar(recurso);
    registrar(propietario, 'COMPARTIR', op.recursoTipo, recurso, `Con ${destinatario.username} (${op.nivel})`, fecha);
    return propietario;
  },

  async REVOCAR(op, fecha) {
    const recurso = op.recursoTipo === 'CARPETA' ? carpeta(op.clave) : archivo(op.clave);
    const propietario = usuario(op.recursoTipo === 'CARPETA' ? CARPETAS[op.clave] : propietarioDeArchivo(op.clave));
    const destinatario = usuario(op.con);
    const indice = recurso.compartidoCon.findIndex((p) => p.usuarioId.equals(destinatario._id));
    if (indice === -1) throw new ErrorSimulacion(`"${recurso.nombre}" no esta compartido con ${op.con}`);

    const { nivel } = recurso.compartidoCon[indice];
    recurso.compartidoCon.splice(indice, 1);
    recurso.actualizadoEn = fecha;
    await guardar(recurso);
    registrar(propietario, 'REVOCAR', op.recursoTipo, recurso, `A ${destinatario.username} (tenía ${nivel})`, fecha);
    return propietario;
  },

  async DESCARGAR(op, fecha) {
    const actor = usuario(op.actor);
    const arch = archivo(op.clave);
    if (arch.eliminado.estado) throw new ErrorSimulacion(`"${arch.nombre}" esta en la papelera`);
    const nivel = nivelDeAcceso(actor, arch);
    if (!nivel) throw new ErrorSimulacion(`${actor.username} no tiene acceso a "${arch.nombre}"`);

    const via = { PROPIETARIO: 'como propietario', ADMINISTRADOR: 'como administrador' }[nivel] ?? `con permiso de ${nivel}`;
    registrar(actor, 'DESCARGAR', 'ARCHIVO', arch, `Descargado ${via}`, fecha);
    return actor;
  },

  async ELIMINAR(op, fecha) {
    const arch = archivo(op.clave);
    const propietario = usuario(propietarioDeArchivo(op.clave));
    if (arch.eliminado.estado) throw new ErrorSimulacion(`"${arch.nombre}" ya esta en la papelera`);

    // No se borra: se marca, y se recuerda la carpeta para poder restaurarlo.
    // El almacenamiento NO se libera (regla 5.4).
    const origen = [...carpetas.values()].find((c) => c._id.equals(arch.carpetaId));
    arch.eliminado = { estado: true, fecha, eliminadoPor: propietario._id, padreOriginalId: arch.carpetaId };
    arch.actualizadoEn = fecha;
    await guardar(arch);
    registrar(propietario, 'ELIMINAR', 'ARCHIVO', arch, `Enviado a la papelera desde ${origen?.ruta ?? 'la raíz'}`, fecha);
    return propietario;
  },

  async ELIMINAR_CARPETA(op, fecha) {
    const raiz = carpeta(op.clave);
    const propietario = usuario(CARPETAS[op.clave]);

    // Papelera en cascada (regla 5.3): la carpeta y todo su subarbol, que sale
    // de los `ancestros` sin recorrer el arbol.
    const marcar = async (documento, padreOriginalId) => {
      documento.eliminado = { estado: true, fecha, eliminadoPor: propietario._id, padreOriginalId };
      documento.actualizadoEn = fecha;
      await guardar(documento);
    };
    await marcar(raiz, raiz.padreId);
    let subcarpetas = 0;
    let contenidos = 0;
    for (const sub of carpetas.values()) {
      if (sub.eliminado.estado || !sub.ancestros.some((id) => id.equals(raiz._id))) continue;
      await marcar(sub, sub.padreId);
      subcarpetas++;
    }
    for (const arch of archivos.values()) {
      if (arch.eliminado.estado || !arch.ancestros.some((id) => id.equals(raiz._id))) continue;
      await marcar(arch, arch.carpetaId);
      contenidos++;
    }
    registrar(propietario, 'ELIMINAR_CARPETA', 'CARPETA', raiz, `Enviada a la papelera con ${subcarpetas} subcarpetas y ${contenidos} archivos`, fecha);
    return propietario;
  },

  async RESTAURAR(op, fecha) {
    const arch = archivo(op.clave);
    const propietario = usuario(propietarioDeArchivo(op.clave));
    if (!arch.eliminado.estado) throw new ErrorSimulacion(`"${arch.nombre}" no esta en la papelera`);

    // Vuelve a su carpeta original si sigue disponible; si no, a la raiz.
    const original = [...carpetas.values()].find((c) => c._id.equals(arch.eliminado.padreOriginalId));
    const destino = original && !original.eliminado.estado ? original : null;
    arch.carpetaId = destino?._id ?? null;
    arch.ancestros = destino ? [...destino.ancestros, destino._id] : [];
    arch.eliminado = {};
    arch.actualizadoEn = fecha;
    await guardar(arch);
    registrar(propietario, 'RESTAURAR', 'ARCHIVO', arch, `Restaurado a ${destino?.ruta ?? 'la raíz'}`, fecha);
    return propietario;
  },

  async ELIMINAR_DEFINITIVO(op, fecha) {
    const arch = archivo(op.clave);
    const propietario = usuario(propietarioDeArchivo(op.clave));
    if (!arch.eliminado.estado) throw new ErrorSimulacion('Solo se elimina definitivamente desde la papelera');

    // Borra contenido y metadatos, y ahora si libera el espacio.
    await eliminarContenido(arch.gridfsId);
    await Archivo.deleteOne({ _id: arch._id });
    archivos.delete(op.clave);
    propietario.almacenamientoUsado -= arch.tamano;
    await guardar(propietario);
    // recursoId queda apuntando a un documento que ya no existe: por eso la
    // entrada guarda tambien el nombre.
    registrar(propietario, 'ELIMINAR_DEFINITIVO', 'ARCHIVO', arch, `Liberados ${formatearBytes(arch.tamano)}`, fecha);
    return propietario;
  },
};

// ---------------------------------------------------------------------------
// Pasos de la carga
// ---------------------------------------------------------------------------

async function vaciarBase() {
  const db = mongoose.connection.db;
  const existentes = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
  const aBorrar = ['usuarios', 'carpetas', 'archivos', 'actividad', `${NOMBRE_BUCKET}.files`, `${NOMBRE_BUCKET}.chunks`];
  for (const nombre of aBorrar) {
    if (existentes.has(nombre)) await db.dropCollection(nombre);
  }
  // Recrea las colecciones con los indices declarados en los esquemas.
  for (const modelo of [Usuario, Carpeta, Archivo, Actividad]) {
    await modelo.createCollection();
    await modelo.syncIndexes();
  }
}

async function crearUsuario(datos, fecha) {
  const nuevo = new Usuario({
    ...datos,
    passwordHash: await bcrypt.hash(CONTRASENA_PRUEBA, COSTO_BCRYPT),
    creadoEn: fecha,
  });
  await guardar(nuevo);
  usuarios.set(nuevo.username, nuevo);
  return nuevo;
}

async function reproducirLineaDeTiempo() {
  // El administrador existe desde el arranque del sistema: es quien crea al
  // resto, asi que no tiene entrada de creacion en el historial.
  const datosAdmin = USUARIOS.find((u) => u.rol === 'ADMINISTRADOR');
  const [anio, mes, dia] = INICIO_SIMULACION.split('-').map(Number);
  await crearUsuario(datosAdmin, fechaGuatemala(anio, mes - 1, dia, 7 * 60 + 30));

  let total = 0;
  for (const { mes, operaciones: lista } of LINEA_DE_TIEMPO) {
    const fechas = repartirEnMes(mes, lista.length);
    for (const [i, op] of lista.entries()) {
      const ejecutar = operaciones[op.tipo];
      if (!ejecutar) throw new ErrorSimulacion(`Operacion desconocida: ${op.tipo}`);
      // El login se registra antes de ejecutar, con el actor que hara la
      // operacion (que se conoce de antemano para no alterar el orden).
      registrarLoginSiCorresponde(actorDe(op), fechas[i]);
      try {
        await ejecutar(op, fechas[i]);
      } catch (error) {
        error.message = `[${mes} #${i + 1} ${op.tipo} ${op.clave ?? op.username}] ${error.message}`;
        throw error;
      }
      total++;
    }
  }
  return total;
}

// Quien ejecuta la operacion: el indicado (descargas, acciones del admin) o,
// si no, el propietario del recurso.
function actorDe(op) {
  if (op.actor) return usuario(op.actor);
  const esDeCarpeta = ['CREAR_CARPETA', 'MOVER_CARPETA', 'ELIMINAR_CARPETA'].includes(op.tipo) || op.recursoTipo === 'CARPETA';
  return usuario(esDeCarpeta ? CARPETAS[op.clave] : propietarioDeArchivo(op.clave));
}

/**
 * Recalcula `almacenamientoUsado` con una agregacion y lo compara con el valor
 * que se fue manteniendo operacion a operacion. Si no coinciden, la logica de
 * suma/resta tiene un error, y se detiene la carga.
 */
async function recalcularAlmacenamiento() {
  const sumas = await Archivo.aggregate([
    // Todos los archivos que existen, incluidos los de la papelera: la
    // papelera no libera espacio, solo la eliminacion definitiva.
    { $group: { _id: '$propietarioId', bytes: { $sum: '$tamano' } } },
  ]);
  const porUsuario = new Map(sumas.map((s) => [String(s._id), s.bytes]));
  for (const u of usuarios.values()) {
    const calculado = porUsuario.get(String(u._id)) ?? 0;
    if (calculado !== u.almacenamientoUsado) {
      throw new ErrorSimulacion(`Almacenamiento de ${u.username} descuadrado: incremental ${u.almacenamientoUsado}, real ${calculado}`);
    }
    await Usuario.updateOne({ _id: u._id }, { $set: { almacenamientoUsado: calculado } });
  }
}

async function principal() {
  const inicio = Date.now();
  const conexion = await conectarBaseDatos();
  console.log(`Conectado a ${conexion.name}`);

  await vaciarBase();
  console.log('Colecciones y GridFS vaciados; indices creados');

  const total = await reproducirLineaDeTiempo();
  historial.sort((a, b) => a.fecha - b.fecha);
  await Actividad.insertMany(historial);
  await recalcularAlmacenamiento();

  const [nCarpetas, nArchivos, nPapelera, nCarpetasPapelera, nGridfs] = await Promise.all([
    Carpeta.countDocuments(),
    Archivo.countDocuments(),
    Archivo.countDocuments({ 'eliminado.estado': true }),
    Carpeta.countDocuments({ 'eliminado.estado': true }),
    mongoose.connection.db.collection(`${NOMBRE_BUCKET}.files`).countDocuments(),
  ]);
  const permisos = [...carpetas.values(), ...archivos.values()].reduce((s, d) => s + d.compartidoCon.length, 0);

  console.log(`\nOperaciones simuladas: ${total}`);
  console.log(`Usuarios:              ${usuarios.size}`);
  console.log(`Carpetas:              ${nCarpetas} (${nCarpetasPapelera} en papelera)`);
  console.log(`Archivos:              ${nArchivos} (${nPapelera} en papelera)`);
  console.log(`Contenidos en GridFS:  ${nGridfs}`);
  console.log(`Permisos vigentes:     ${permisos}`);
  console.log(`Entradas de historial: ${historial.length}`);
  console.log('\nAlmacenamiento por usuario:');
  for (const u of usuarios.values()) {
    console.log(`  ${u.username.padEnd(8)} ${formatearBytes(u.almacenamientoUsado).padStart(9)}  (${u.almacenamientoUsado} bytes)`);
  }
  console.log(`\nContraseña de todos los usuarios: ${CONTRASENA_PRUEBA}`);
  console.log(`Carga completada en ${((Date.now() - inicio) / 1000).toFixed(1)} s`);
}

try {
  await principal();
} catch (error) {
  console.error(`\nERROR en la carga inicial: ${error.message}`);
  process.exitCode = 1;
} finally {
  await desconectarBaseDatos();
}
