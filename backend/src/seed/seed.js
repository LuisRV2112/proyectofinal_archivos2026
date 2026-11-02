// npm run seed. No inserta documentos armados: reproduce la linea de tiempo
// de datos.js aplicando las mismas reglas que la API, y cada operacion deja
// su entrada en actividad. Asi ancestros, ruta, tamano y almacenamientoUsado
// salen calculados y no escritos a mano.
// Vacia la base antes de cargar, se puede repetir.
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

// Los indices se crean despues de vaciar, no al conectar.
mongoose.set('autoIndex', false);

const COSTO_BCRYPT = 10;
// Guatemala: UTC-6 todo el ano.
const DESFASE_UTC_HORAS = 6;
const JORNADA = { inicioMinutos: 8 * 60, duracionMinutos: 9.5 * 60 }; // 8:00 a 17:30

// Utilidades de la simulacion

// Semilla fija (mulberry32): cada ejecucion da los mismos datos.
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

// Reparte las operaciones en el horario laboral del mes sin cambiar su orden.
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

// Estado de la simulacion

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

// LOGIN unos minutos antes de la primera operacion del dia.
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

// Mismas reglas de acceso que servicios/permisos.js.
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

// timestamps:false para usar las fechas simuladas.
const guardar = (documento) => documento.save({ timestamps: false });

// Operaciones

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

    // El tamano es el que reporta GridFS.
    const contenido = Buffer.from(especificacion.contenido(), 'utf8');
    const { gridfsId, tamano } = await subirContenido(contenido, nombre, {
      propietarioId: propietario._id,
      mimeType: MIME_POR_EXTENSION[extension],
    });
    // uploadDate con la fecha simulada.
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

    // Sin ciclos.
    if (destino && (destino._id.equals(movida._id) || destino.ancestros.some((id) => id.equals(movida._id)))) {
      throw new ErrorSimulacion(`Mover "${movida.ruta}" a "${destino.ruta}" crearia un ciclo`);
    }
    validarNombreLibre(carpetas, 'padreId', destino?._id, movida.propietarioId, movida.nombre, movida._id);

    const rutaAnterior = movida.ruta;
    const ancestrosNuevos = destino ? [...destino.ancestros, destino._id] : [];
    const rutaNueva = destino ? `${destino.ruta}/${movida.nombre}` : `/${movida.nombre}`;

    // Cambia el tramo de ancestros por encima de la carpeta movida.
    const reubicar = (ancestros) => {
      const posicion = ancestros.findIndex((id) => id.equals(movida._id));
      return [...ancestrosNuevos, ...ancestros.slice(posicion)];
    };

    movida.padreId = destino?._id ?? null;
    movida.ancestros = ancestrosNuevos;
    movida.ruta = rutaNueva;
    movida.actualizadoEn = fecha;
    await guardar(movida);

    // Se reescribe todo el subarbol.
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

    // Solo se marca; el espacio no se libera.
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

    // En cascada con todo el subarbol.
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

    // A su carpeta original o a la raiz.
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

    // Ahora si se libera el espacio.
    await eliminarContenido(arch.gridfsId);
    await Archivo.deleteOne({ _id: arch._id });
    archivos.delete(op.clave);
    propietario.almacenamientoUsado -= arch.tamano;
    await guardar(propietario);
    // recursoNombre mantiene legible la entrada.
    registrar(propietario, 'ELIMINAR_DEFINITIVO', 'ARCHIVO', arch, `Liberados ${formatearBytes(arch.tamano)}`, fecha);
    return propietario;
  },
};

// Pasos de la carga

async function vaciarBase() {
  const db = mongoose.connection.db;
  const existentes = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
  const aBorrar = ['usuarios', 'carpetas', 'archivos', 'actividad', `${NOMBRE_BUCKET}.files`, `${NOMBRE_BUCKET}.chunks`];
  for (const nombre of aBorrar) {
    if (existentes.has(nombre)) await db.dropCollection(nombre);
  }
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
  // El administrador ya existe; no tiene entrada de creacion.
  const datosAdmin = USUARIOS.find((u) => u.rol === 'ADMINISTRADOR');
  const [anio, mes, dia] = INICIO_SIMULACION.split('-').map(Number);
  await crearUsuario(datosAdmin, fechaGuatemala(anio, mes - 1, dia, 7 * 60 + 30));

  let total = 0;
  for (const { mes, operaciones: lista } of LINEA_DE_TIEMPO) {
    const fechas = repartirEnMes(mes, lista.length);
    for (const [i, op] of lista.entries()) {
      const ejecutar = operaciones[op.tipo];
      if (!ejecutar) throw new ErrorSimulacion(`Operacion desconocida: ${op.tipo}`);
      // Login antes de la operacion.
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

// El actor indicado o, si no hay, el propietario.
function actorDe(op) {
  if (op.actor) return usuario(op.actor);
  const esDeCarpeta = ['CREAR_CARPETA', 'MOVER_CARPETA', 'ELIMINAR_CARPETA'].includes(op.tipo) || op.recursoTipo === 'CARPETA';
  return usuario(esDeCarpeta ? CARPETAS[op.clave] : propietarioDeArchivo(op.clave));
}

// Compara almacenamientoUsado con una agregacion; si no cuadra, se detiene.
async function recalcularAlmacenamiento() {
  const sumas = await Archivo.aggregate([
    // La papelera tambien cuenta.
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
