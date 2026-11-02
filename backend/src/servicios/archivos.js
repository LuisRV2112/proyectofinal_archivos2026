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

// fatal: falla si el contenido no es UTF-8.
const decodificadorUtf8 = new TextDecoder('utf-8', { fatal: true });

async function buscarArchivoActivo(id) {
  const archivo = await Archivo.findOne({ _id: exigirObjectId(id, 'id de archivo'), ...NO_ELIMINADO });
  if (!archivo) throw new ErrorNoEncontrado('Archivo no encontrado', 'No existe o está en la papelera');
  return archivo;
}

// null = raiz
async function buscarCarpetaDestino(carpetaId, usuario) {
  if (carpetaId === undefined || carpetaId === null || carpetaId === '') return null;
  const carpeta = await Carpeta.findOne({ _id: exigirObjectId(String(carpetaId), 'carpetaId'), ...NO_ELIMINADO });
  if (!carpeta) throw new ErrorNoEncontrado('Carpeta destino no encontrada', 'No existe o está en la papelera');
  exigirPropietario(carpeta, usuario, 'guardar archivos en esta carpeta');
  return carpeta;
}

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

// "contrato, cliente" -> ['contrato', 'cliente'], en minusculas y sin repetir.
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

function metadatos(archivo) {
  const objeto = archivo.toJSON();
  delete objeto.gridfsId;
  return objeto;
}

// POST /api/archivos. Tambien lo usa el editor (origen=editor), asi ambos
// pasan por las mismas validaciones.
// Primero se sube a GridFS y luego se crea el documento, para que nunca
// apunte a contenido que no existe. Si el documento falla, se borra el
// contenido para no dejarlo huerfano.
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

  // Detecta binarios renombrados a .txt.
  try {
    decodificadorUtf8.decode(archivoRecibido.buffer);
  } catch {
    throw new ErrorValidacion('El archivo no es texto válido', 'El contenido debe estar codificado en UTF-8');
  }

  // Validar antes de escribir en GridFS.
  const carpeta = await buscarCarpetaDestino(campos?.carpetaId, usuario);
  await validarNombreLibre(Archivo, 'carpetaId', { propietarioId: usuario._id, padreId: carpeta?._id, nombre });

  // No se confia en el MIME que manda el cliente.
  const mimeType = MIME_POR_EXTENSION[extension];

  // Se reserva el espacio con un $inc condicionado: comprobar y sumar en una
  // sola operacion atomica evita que dos subidas a la vez pasen la cuota.
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
  // Si algo falla despues, se devuelve lo reservado.
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
      tamano,
      propietarioId: usuario._id,
      carpetaId: carpeta?._id ?? null,
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

// GET /api/archivos/:id. El nivel de acceso le dice al cliente que acciones mostrar.
export async function obtenerArchivo(id, usuario) {
  const archivo = await buscarArchivoActivo(id);
  const acceso = await exigirNivel(archivo, usuario, 'LECTURA');
  const carpeta = archivo.carpetaId ? await Carpeta.findById(archivo.carpetaId, { ruta: 1 }) : null;
  return { ...metadatos(archivo), ubicacion: carpeta?.ruta ?? '/', acceso };
}

async function archivoConContenido(id, usuario) {
  const archivo = await buscarArchivoActivo(id);
  const acceso = await exigirNivel(archivo, usuario, 'LECTURA');
  if (!(await existeContenido(archivo.gridfsId))) {
    // Inconsistencia con GridFS: es error del servidor.
    console.error(`[archivos] ${archivo._id} apunta a un contenido inexistente (${archivo.gridfsId})`);
    throw new ErrorApi(500, 'El contenido del archivo no está disponible');
  }
  return { archivo, acceso };
}

// GET /api/archivos/:id/descargar. Se envia por stream, chunk a chunk.
export async function prepararDescarga(id, usuario) {
  const { archivo, acceso } = await archivoConContenido(id, usuario);
  await registrarActividad({
    usuarioId: usuario._id,
    accion: 'DESCARGAR',
    recursoTipo: 'ARCHIVO',
    recursoId: archivo._id,
    recursoNombre: archivo.nombre,
    detalle: `Descargado ${describirAcceso(acceso)}`,
  });
  return { archivo, flujo: abrirDescarga(archivo.gridfsId) };
}

// GET /api/archivos/:id/contenido. La vista previa no cuenta como DESCARGAR.
export async function leerTexto(id, usuario) {
  const { archivo } = await archivoConContenido(id, usuario);
  return { archivo, texto: (await leerContenido(archivo.gridfsId)).toString('utf8') };
}

// PATCH /api/archivos/:id. La extension no se puede cambiar.
export async function renombrarArchivo(id, cuerpo, usuario) {
  exigirObjeto(cuerpo);
  rechazarCamposDesconocidos(cuerpo, ['nombre']);
  const { nombre, extension } = validarNombreArchivo(cuerpo.nombre);
  const archivo = await buscarArchivoActivo(id);
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

  // El filename de GridFS es informativo; si falla no se revierte.
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

// PATCH /api/archivos/:id/mover. Solo cambian carpetaId y ancestros;
// GridFS no se toca.
export async function moverArchivo(id, cuerpo, usuario) {
  exigirObjeto(cuerpo);
  rechazarCamposDesconocidos(cuerpo, ['carpetaId']);
  if (!('carpetaId' in cuerpo)) {
    throw new ErrorValidacion('El campo "carpetaId" es obligatorio', 'Usa null para mover a la raíz');
  }

  const archivo = await buscarArchivoActivo(id);
  exigirPropietario(archivo, usuario, 'mover este archivo');
  const destino = await buscarCarpetaDestino(cuerpo.carpetaId, usuario);

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
