import { Archivo, Carpeta, MIME_POR_EXTENSION, Usuario } from '../modelos/index.js';
import {
  abrirDescarga,
  eliminarContenido,
  existeContenido,
  leerContenido,
  renombrarContenido,
  subirContenido,
} from '../config/gridfs.js';
import { ErrorApi, ErrorConflicto, ErrorNoEncontrado, ErrorValidacion } from '../utilidades/errores.js';
import { extensionDe, formatearBytes } from '../utilidades/formato.js';
import { exigirObjectId, exigirObjeto, rechazarCamposDesconocidos } from '../utilidades/validacion.js';
import { registrarActividad } from './actividad.js';
import { ubicacionDentroDe, validarNombreLibre } from './arbol.js';
import { describirAcceso, exigirNivel, exigirPropietario } from './permisos.js';

const NO_ELIMINADO = { 'eliminado.estado': false };
const MAXIMO_ETIQUETAS = 10;

// Decodificador estricto: falla ante cualquier secuencia que no sea UTF-8.
const decodificadorUtf8 = new TextDecoder('utf-8', { fatal: true });

/** Un archivo que no esta en la papelera; si no, 404. */
async function buscarArchivoActivo(id) {
  const archivo = await Archivo.findOne({ _id: exigirObjectId(id, 'id de archivo'), ...NO_ELIMINADO });
  if (!archivo) throw new ErrorNoEncontrado('Archivo no encontrado', 'No existe o está en la papelera');
  return archivo;
}

/** Carpeta destino propia y activa; null = raiz del usuario. */
async function buscarCarpetaDestino(carpetaId, usuario) {
  if (carpetaId === undefined || carpetaId === null || carpetaId === '') return null;
  const carpeta = await Carpeta.findOne({ _id: exigirObjectId(String(carpetaId), 'carpetaId'), ...NO_ELIMINADO });
  if (!carpeta) throw new ErrorNoEncontrado('Carpeta destino no encontrada', 'No existe o está en la papelera');
  exigirPropietario(carpeta, usuario, 'guardar archivos en esta carpeta');
  return carpeta;
}

/**
 * Valida el nombre con las reglas del esquema (sin barras, longitud) y que
 * la extension sea .txt o .md. Devuelve {nombre, extension}.
 */
function validarNombreArchivo(valor) {
  const nombre = typeof valor === 'string' ? valor.trim() : '';
  if (!nombre) throw new ErrorValidacion('El nombre del archivo es obligatorio');
  const extension = extensionDe(nombre);
  if (!MIME_POR_EXTENSION[extension]) {
    throw new ErrorValidacion('Tipo de archivo no permitido', `Solo se aceptan .txt y .md; se recibió "${nombre}"`);
  }
  const error = new Archivo({ nombre, extension }).validateSync(['nombre']);
  if (error) throw new ErrorValidacion('Nombre de archivo no válido', error.errors.nombre.message);
  return { nombre, extension };
}

/**
 * Etiquetas desde un formulario multipart: "contrato, cliente" o el campo
 * repetido. Se normalizan (minusculas, sin repetir) para que el indice de
 * texto y los filtros no distingan "Contrato" de "contrato".
 */
function leerEtiquetas(valor) {
  if (valor === undefined || valor === '') return [];
  const lista = (Array.isArray(valor) ? valor : String(valor).split(','))
    .map((e) => String(e).trim().toLowerCase())
    .filter(Boolean);
  const unicas = [...new Set(lista)];
  if (unicas.length > MAXIMO_ETIQUETAS) throw new ErrorValidacion(`Máximo ${MAXIMO_ETIQUETAS} etiquetas por archivo`);
  if (unicas.some((e) => e.length > 40)) throw new ErrorValidacion('Cada etiqueta admite como máximo 40 caracteres');
  return unicas;
}

/** Metadatos para la API: sin `gridfsId`, que es un detalle interno. */
function metadatos(archivo) {
  const objeto = archivo.toJSON();
  delete objeto.gridfsId;
  return objeto;
}

/**
 * POST /api/archivos — multipart con `archivo` y, opcionales, `carpetaId`,
 * `etiquetas` y `origen`.
 *
 * Sirve tanto para SUBIR un archivo del equipo como para CREAR uno escrito
 * en el editor de la aplicacion (`origen=editor`): el frontend arma el
 * archivo con el texto y lo envia igual. Un solo camino hacia GridFS hace que
 * las dos formas pasen por las mismas validaciones (extension, UTF-8, nombre
 * libre, cuota); `origen` solo cambia como queda descrito en el historial.
 *
 * Orden: primero el contenido a GridFS y despues el documento con su
 * gridfsId. Al reves, existiria un instante en que el documento apunta a un
 * contenido que todavia no esta, y un listado o descarga en ese momento
 * fallaria. Si el documento no se puede guardar, se BORRA el contenido recien
 * subido: si no, quedaria contenido huerfano en GridFS ocupando espacio, sin
 * ningun documento que lo muestre ni forma de eliminarlo desde la aplicacion.
 */
export async function subirArchivo(archivoRecibido, campos, usuario) {
  if (!archivoRecibido) {
    throw new ErrorValidacion('No se recibió ningún archivo', 'Envía el archivo en el campo "archivo" (multipart/form-data)');
  }
  const { nombre, extension } = validarNombreArchivo(archivoRecibido.originalname);
  const etiquetas = leerEtiquetas(campos?.etiquetas);
  const origen = campos?.origen ?? 'subida';
  if (!['subida', 'editor'].includes(origen)) {
    throw new ErrorValidacion(`Origen no válido: ${origen}`, 'Valores aceptados: subida, editor');
  }

  // La extension no garantiza que sea texto: un binario renombrado a .txt se
  // detecta porque no es UTF-8 valido.
  try {
    decodificadorUtf8.decode(archivoRecibido.buffer);
  } catch {
    throw new ErrorValidacion('El archivo no es texto válido', 'El contenido debe estar codificado en UTF-8');
  }

  // Todas las validaciones ANTES de escribir en GridFS, para no subir
  // contenido que luego habria que borrar.
  const carpeta = await buscarCarpetaDestino(campos?.carpetaId, usuario);
  await validarNombreLibre(Archivo, 'carpetaId', { propietarioId: usuario._id, padreId: carpeta?._id, nombre });

  // El MIME sale de la extension, no de lo que declare el cliente.
  const mimeType = MIME_POR_EXTENSION[extension];

  // Cuota: se RESERVA el espacio antes de escribir en GridFS, con un $inc
  // condicionado a que quepa. La comprobacion y la suma son una sola
  // operacion atomica sobre el documento del usuario, asi que dos subidas
  // simultaneas no pueden pasarse de la cuota entre las dos (con "leer,
  // comparar y luego sumar" ambas verian espacio libre). Computed Pattern:
  // el total se mantiene al dia sumando aqui, en vez de recalcularlo.
  const bytes = archivoRecibido.buffer.length;
  const reserva = await Usuario.updateOne(
    { _id: usuario._id, $expr: { $lte: [{ $add: ['$almacenamientoUsado', bytes] }, '$cuotaAlmacenamiento'] } },
    { $inc: { almacenamientoUsado: bytes } }
  );
  if (reserva.modifiedCount === 0) {
    const actual = await Usuario.findById(usuario._id);
    throw new ErrorConflicto(
      'No tienes espacio suficiente para este archivo',
      `El archivo ocupa ${formatearBytes(bytes)} y te quedan ${formatearBytes(actual.almacenamientoDisponible)} ` +
        `de ${formatearBytes(actual.cuotaAlmacenamiento)}. Libera espacio vaciando la papelera.`
    );
  }
  // Si algo falla de aqui en adelante, el espacio reservado se devuelve: si
  // no, el usuario perderia cuota por un archivo que no existe.
  const liberarReserva = () =>
    Usuario.updateOne({ _id: usuario._id }, { $inc: { almacenamientoUsado: -bytes } }).catch((e) =>
      console.error(`[archivos] No se pudo devolver la reserva de ${bytes} bytes a ${usuario.username}: ${e.message}`)
    );

  let gridfsId, tamano;
  try {
    ({ gridfsId, tamano } = await subirContenido(archivoRecibido.buffer, nombre, {
      propietarioId: usuario._id,
      mimeType,
    }));
  } catch (error) {
    await liberarReserva();
    throw error;
  }

  let archivo;
  try {
    archivo = await Archivo.create({
      nombre,
      extension,
      mimeType,
      // Bytes que GridFS reporta haber guardado: coincide con contenido.files.
      tamano,
      propietarioId: usuario._id,
      carpetaId: carpeta?._id ?? null,
      // Ancestros de la carpeta MAS la carpeta (ver modelo Archivo).
      ancestros: ubicacionDentroDe(carpeta, nombre).ancestros,
      gridfsId,
      etiquetas,
    });
  } catch (error) {
    await eliminarContenido(gridfsId).catch((e) =>
      console.error(`[archivos] No se pudo borrar el contenido huérfano ${gridfsId}: ${e.message}`)
    );
    await liberarReserva();
    throw error;
  }

  await registrarActividad({
    usuarioId: usuario._id,
    accion: 'SUBIR',
    recursoTipo: 'ARCHIVO',
    recursoId: archivo._id,
    recursoNombre: archivo.nombre,
    detalle: `${origen === 'editor' ? 'Creado en el editor en' : 'Subido a'} ${carpeta?.ruta ?? 'la raíz'} (${formatearBytes(tamano)})`,
  });
  return metadatos(archivo);
}

/**
 * GET /api/archivos/:id — metadatos, con la ruta legible de su carpeta y el
 * nivel de acceso del usuario (el cliente lo usa para mostrar u ocultar
 * acciones como renombrar).
 */
export async function obtenerArchivo(id, usuario) {
  const archivo = await buscarArchivoActivo(id);
  const acceso = await exigirNivel(archivo, usuario, 'LECTURA');
  const carpeta = archivo.carpetaId ? await Carpeta.findById(archivo.carpetaId, { ruta: 1 }) : null;
  return { ...metadatos(archivo), ubicacion: carpeta?.ruta ?? '/', acceso };
}

/** Archivo legible por el usuario y con su contenido presente en GridFS. */
async function archivoConContenido(id, usuario) {
  const archivo = await buscarArchivoActivo(id);
  const acceso = await exigirNivel(archivo, usuario, 'LECTURA');
  if (!(await existeContenido(archivo.gridfsId))) {
    // No deberia pasar nunca: indica una inconsistencia entre la coleccion y
    // GridFS. Se reporta como error del servidor, no del cliente.
    console.error(`[archivos] ${archivo._id} apunta a un contenido inexistente (${archivo.gridfsId})`);
    throw new ErrorApi(500, 'El contenido del archivo no está disponible');
  }
  return { archivo, acceso };
}

/**
 * GET /api/archivos/:id/descargar — devuelve el archivo y un stream de
 * GridFS. Se envia por stream (chunk a chunk) en lugar de leerlo entero en
 * memoria: el servidor no necesita tener el archivo completo para empezar a
 * responder.
 */
export async function prepararDescarga(id, usuario) {
  const { archivo, acceso } = await archivoConContenido(id, usuario);
  await registrarActividad({
    usuarioId: usuario._id,
    accion: 'DESCARGAR',
    recursoTipo: 'ARCHIVO',
    recursoId: archivo._id,
    recursoNombre: archivo.nombre,
    // Queda registrado por que via accedio: auditable si luego se revoca.
    detalle: `Descargado ${describirAcceso(acceso)}`,
  });
  return { archivo, flujo: abrirDescarga(archivo.gridfsId) };
}

/**
 * GET /api/archivos/:id/contenido — el texto, para la vista previa.
 * No se registra como DESCARGAR: es solo mirar el archivo dentro de la
 * aplicacion, y contarlo inflaria el historial y los reportes de descargas.
 */
export async function leerTexto(id, usuario) {
  const { archivo } = await archivoConContenido(id, usuario);
  return { archivo, texto: (await leerContenido(archivo.gridfsId)).toString('utf8') };
}

/**
 * PATCH /api/archivos/:id — { nombre }
 *
 * La extension no puede cambiar: renombrar no convierte un .md en .txt, y
 * cambiarla dejaria `extension` y `mimeType` contando otra cosa que el
 * contenido real (y alteraria los reportes por tipo).
 */
export async function renombrarArchivo(id, cuerpo, usuario) {
  exigirObjeto(cuerpo);
  rechazarCamposDesconocidos(cuerpo, ['nombre']);
  const { nombre, extension } = validarNombreArchivo(cuerpo.nombre);
  const archivo = await buscarArchivoActivo(id);
  // Renombrar lo puede hacer tambien quien tenga EDICION (directa o heredada).
  await exigirNivel(archivo, usuario, 'EDICION');

  if (extension !== archivo.extension) {
    throw new ErrorValidacion('No se puede cambiar la extensión del archivo', `Debe seguir terminando en .${archivo.extension}`);
  }
  if (nombre === archivo.nombre) return metadatos(archivo);
  await validarNombreLibre(Archivo, 'carpetaId', {
    propietarioId: archivo.propietarioId,
    padreId: archivo.carpetaId,
    nombre,
    excluirId: archivo._id,
  });

  const anterior = archivo.nombre;
  archivo.nombre = nombre;
  await archivo.save();

  // El filename de GridFS es solo informativo (la aplicacion siempre llega
  // al contenido por gridfsId), asi que si este paso fallara el renombrado
  // sigue siendo valido: se deja constancia y no se revierte.
  await renombrarContenido(archivo.gridfsId, nombre).catch((e) =>
    console.error(`[archivos] No se pudo renombrar en GridFS ${archivo.gridfsId}: ${e.message}`)
  );

  await registrarActividad({
    usuarioId: usuario._id,
    accion: 'RENOMBRAR',
    recursoTipo: 'ARCHIVO',
    recursoId: archivo._id,
    recursoNombre: nombre,
    detalle: `De "${anterior}" a "${nombre}"`,
  });
  return metadatos(archivo);
}

/**
 * PATCH /api/archivos/:id/mover — { carpetaId } (null = a la raiz)
 *
 * A diferencia de una carpeta, un archivo no tiene descendientes: basta con
 * recalcular su `carpetaId` y su `ancestros` (los de la carpeta destino mas
 * la carpeta). El contenido en GridFS no se toca: mover es cambiar metadatos.
 */
export async function moverArchivo(id, cuerpo, usuario) {
  exigirObjeto(cuerpo);
  rechazarCamposDesconocidos(cuerpo, ['carpetaId']);
  if (!('carpetaId' in cuerpo)) {
    throw new ErrorValidacion('El campo "carpetaId" es obligatorio', 'Usa null para mover a la raíz');
  }

  const archivo = await buscarArchivoActivo(id);
  exigirPropietario(archivo, usuario, 'mover este archivo');
  const destino = await buscarCarpetaDestino(cuerpo.carpetaId, usuario);

  // Ya esta ahi: nada que hacer ni registrar.
  if (String(archivo.carpetaId ?? null) === String(destino?._id ?? null)) return metadatos(archivo);

  await validarNombreLibre(Archivo, 'carpetaId', {
    propietarioId: archivo.propietarioId,
    padreId: destino?._id,
    nombre: archivo.nombre,
    excluirId: archivo._id,
  });

  const origen = archivo.carpetaId ? await Carpeta.findById(archivo.carpetaId, { ruta: 1 }) : null;
  archivo.carpetaId = destino?._id ?? null;
  archivo.ancestros = ubicacionDentroDe(destino, archivo.nombre).ancestros;
  await archivo.save();

  await registrarActividad({
    usuarioId: usuario._id,
    accion: 'MOVER',
    recursoTipo: 'ARCHIVO',
    recursoId: archivo._id,
    recursoNombre: archivo.nombre,
    detalle: `De ${origen?.ruta ?? 'la raíz'} a ${destino?.ruta ?? 'la raíz'}`,
  });
  return metadatos(archivo);
}
