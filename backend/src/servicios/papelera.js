import { Archivo, Carpeta, Usuario } from '../modelos/index.js';
import { eliminarContenido, renombrarContenido } from '../config/gridfs.js';
import { ErrorNoEncontrado, ErrorValidacion } from '../utilidades/errores.js';
import { formatearBytes } from '../utilidades/formato.js';
import { exigirObjectId } from '../utilidades/validacion.js';
import { registrarActividad } from './actividad.js';
import { primerNombreLibre, reubicarSubarbol, ubicacionDentroDe } from './arbol.js';
import { exigirPropietario } from './permisos.js';

/**
 * Papelera (regla 5.3): eliminar NO borra, marca el subdocumento embebido
 * `eliminado`. Todos los listados filtran {"eliminado.estado": false}, asi
 * que lo marcado desaparece de la vista normal sin perder nada.
 *
 * Como se reconoce lo que se elimino JUNTO con una carpeta: todo el subarbol
 * recibe la MISMA fecha y el MISMO autor que la carpeta. Al restaurarla se
 * traen de vuelta solo los descendientes con esa fecha y autor; algo que se
 * habia eliminado antes por separado (otra fecha) se queda en la papelera,
 * que es lo que el usuario espera.
 *
 * Solo el propietario usa su papelera: eliminar libera (o no) SU espacio y
 * reorganiza SU arbol. Ni EDICION ni el rol de administrador bastan.
 */

const TIPOS = {
  archivo: { Modelo: Archivo, recursoTipo: 'ARCHIVO', campoPadre: 'carpetaId' },
  carpeta: { Modelo: Carpeta, recursoTipo: 'CARPETA', campoPadre: 'padreId' },
};

const SIN_ELIMINAR = { estado: false, fecha: null, eliminadoPor: null, padreOriginalId: null };

function leerTipo(tipo) {
  const clave = String(tipo).toLowerCase().replace(/s$/, '');
  if (!TIPOS[clave]) throw new ErrorValidacion(`Tipo de recurso no válido: ${tipo}`, 'Usa "archivos" o "carpetas"');
  return TIPOS[clave];
}

async function buscar(Modelo, id, enPapelera) {
  const recurso = await Modelo.findOne({ _id: exigirObjectId(id), 'eliminado.estado': enPapelera });
  if (!recurso) {
    const que = Modelo === Archivo ? 'El archivo' : 'La carpeta';
    throw new ErrorNoEncontrado(enPapelera ? `${que} no está en la papelera` : `${que} no existe o ya está en la papelera`);
  }
  return recurso;
}

// ---------------------------------------------------------------------------
// Enviar a la papelera
// ---------------------------------------------------------------------------

/** DELETE /api/archivos/:id */
export async function enviarArchivoAPapelera(id, usuario) {
  const archivo = await buscar(Archivo, id, false);
  exigirPropietario(archivo, usuario, 'enviar este archivo a la papelera');

  // carpetaId y ancestros NO se tocan: el archivo sigue "estando" donde
  // estaba (y se mantiene al dia si esa carpeta se mueve). padreOriginalId
  // guarda a donde volver aunque luego cambie algo.
  // El almacenamiento NO se libera (regla 5.4): el archivo sigue ocupando
  // espacio hasta la eliminacion definitiva.
  archivo.eliminado = { estado: true, fecha: new Date(), eliminadoPor: usuario._id, padreOriginalId: archivo.carpetaId };
  await archivo.save();

  const origen = archivo.carpetaId ? await Carpeta.findById(archivo.carpetaId, { ruta: 1 }) : null;
  await registrarActividad({
    usuarioId: usuario._id,
    accion: 'ELIMINAR',
    recursoTipo: 'ARCHIVO',
    recursoId: archivo._id,
    recursoNombre: archivo.nombre,
    detalle: `Enviado a la papelera desde ${origen?.ruta ?? 'la raíz'}`,
  });
  return { enPapelera: true, archivo: archivo._id };
}

/**
 * DELETE /api/carpetas/:id — la carpeta y TODO su subarbol, en cascada.
 *
 * El subarbol sale de {ancestros: carpetaId} (Array of Ancestors): una
 * consulta indexada por coleccion, a cualquier profundidad. Se marca con
 * updateMany usando un pipeline de agregacion como actualizacion, porque
 * `padreOriginalId` es distinto en cada documento (su propio padre) y el
 * pipeline puede copiarlo de un campo del mismo documento ("$padreId",
 * "$carpetaId") en el servidor, sin traer los documentos a la aplicacion.
 *
 * Lo que ya estaba en la papelera (eliminado antes por separado) no se toca:
 * conserva su fecha y no se restaurara junto con la carpeta.
 */
export async function enviarCarpetaAPapelera(id, usuario) {
  const carpeta = await buscar(Carpeta, id, false);
  exigirPropietario(carpeta, usuario, 'enviar esta carpeta a la papelera');

  const fecha = new Date();
  const marca = (campoPadre) => [
    {
      $set: {
        eliminado: { estado: true, fecha, eliminadoPor: usuario._id, padreOriginalId: `$${campoPadre}` },
        actualizadoEn: fecha,
      },
    },
  ];
  const subarbolActivo = { ancestros: carpeta._id, 'eliminado.estado': false };

  // .collection = driver nativo: el pipeline se envia tal cual a MongoDB.
  const [subcarpetas, archivos] = await Promise.all([
    Carpeta.collection.updateMany(subarbolActivo, marca('padreId')),
    Archivo.collection.updateMany(subarbolActivo, marca('carpetaId')),
  ]);
  // La carpeta, al final: mientras no este marcada, la operacion se puede
  // repetir y completaria lo que faltara.
  await Carpeta.collection.updateOne({ _id: carpeta._id }, marca('padreId'));

  await registrarActividad({
    usuarioId: usuario._id,
    accion: 'ELIMINAR_CARPETA',
    recursoTipo: 'CARPETA',
    recursoId: carpeta._id,
    recursoNombre: carpeta.nombre,
    detalle: `Enviada a la papelera con ${subcarpetas.modifiedCount} subcarpetas y ${archivos.modifiedCount} archivos`,
  });
  return {
    enPapelera: true,
    carpeta: carpeta._id,
    subcarpetas: subcarpetas.modifiedCount,
    archivos: archivos.modifiedCount,
  };
}

// ---------------------------------------------------------------------------
// Listar
// ---------------------------------------------------------------------------

/**
 * GET /api/papelera — lo que el usuario elimino, mostrando solo las RAICES de
 * cada eliminacion: una carpeta eliminada aparece una vez, con el resumen de
 * lo que arrastro, no cada uno de sus descendientes por separado.
 *
 * Un elemento es raiz si su carpeta original no esta en la papelera o se
 * elimino en otro momento (distinta fecha).
 */
export async function listarPapelera(usuario) {
  const filtro = { propietarioId: usuario._id, 'eliminado.estado': true };
  const [carpetas, archivos] = await Promise.all([
    Carpeta.find(filtro, { compartidoCon: 0 }).lean(),
    Archivo.find(filtro, { compartidoCon: 0, gridfsId: 0 }).lean(),
  ]);

  const carpetasPorId = new Map(carpetas.map((c) => [String(c._id), c]));
  const mismaEliminacion = (a, b) =>
    a.eliminado.fecha.getTime() === b.eliminado.fecha.getTime() && a.eliminado.eliminadoPor.equals(b.eliminado.eliminadoPor);
  const esRaiz = (d) => {
    const padre = carpetasPorId.get(String(d.eliminado.padreOriginalId));
    return !padre || !mismaEliminacion(padre, d);
  };

  // Rutas de origen para mostrar "Eliminado desde /Contratos".
  const idsOrigen = [...carpetas, ...archivos].map((d) => d.eliminado.padreOriginalId).filter(Boolean);
  const origenes = new Map(
    (await Carpeta.find({ _id: { $in: idsOrigen } }, { ruta: 1 }).lean()).map((c) => [String(c._id), c.ruta])
  );
  const desde = (d) => (d.eliminado.padreOriginalId ? (origenes.get(String(d.eliminado.padreOriginalId)) ?? null) : '/');

  const raicesCarpetas = carpetas.filter(esRaiz).map((c) => {
    const delGrupo = (d) => d.ancestros.some((a) => a.equals(c._id)) && mismaEliminacion(c, d);
    const archivosDentro = archivos.filter(delGrupo);
    return {
      tipo: 'CARPETA',
      _id: c._id,
      nombre: c.nombre,
      eliminadoEn: c.eliminado.fecha,
      ubicacionOriginal: desde(c),
      contiene: {
        carpetas: carpetas.filter(delGrupo).length,
        archivos: archivosDentro.length,
        bytes: archivosDentro.reduce((suma, a) => suma + a.tamano, 0),
      },
    };
  });
  const raicesArchivos = archivos.filter(esRaiz).map((a) => ({
    tipo: 'ARCHIVO',
    _id: a._id,
    nombre: a.nombre,
    extension: a.extension,
    tamano: a.tamano,
    eliminadoEn: a.eliminado.fecha,
    ubicacionOriginal: desde(a),
  }));

  return {
    elementos: [...raicesCarpetas, ...raicesArchivos].sort((x, y) => y.eliminadoEn - x.eliminadoEn),
    // Lo que se liberaria vaciando la papelera.
    bytesOcupados: archivos.reduce((suma, a) => suma + a.tamano, 0),
  };
}

// ---------------------------------------------------------------------------
// Restaurar
// ---------------------------------------------------------------------------

/**
 * A donde vuelve un elemento: su carpeta original si sigue existiendo y no
 * esta en la papelera; si no, la raiz del propietario, con un aviso.
 */
async function destinoDeRestauracion(recurso) {
  const original = recurso.eliminado.padreOriginalId;
  if (!original) return { destino: null, aviso: null };
  const carpeta = await Carpeta.findOne({ _id: original, 'eliminado.estado': false });
  if (carpeta) return { destino: carpeta, aviso: null };
  const sigue = await Carpeta.exists({ _id: original });
  return {
    destino: null,
    aviso: sigue
      ? 'La carpeta original sigue en la papelera: se restauró en la raíz'
      : 'La carpeta original ya no existe: se restauró en la raíz',
  };
}

/** POST /api/papelera/:tipo/:id/restaurar */
export async function restaurar(tipo, id, usuario) {
  const { Modelo, recursoTipo, campoPadre } = leerTipo(tipo);
  const recurso = await buscar(Modelo, id, true);
  exigirPropietario(recurso, usuario, 'restaurar este recurso');

  const { destino, aviso: avisoDestino } = await destinoDeRestauracion(recurso);
  // Mientras estaba en la papelera, otro elemento pudo ocupar su nombre.
  const nombre = await primerNombreLibre(Modelo, campoPadre, {
    propietarioId: recurso.propietarioId,
    padreId: destino?._id,
    nombre: recurso.nombre,
    excluirId: recurso._id,
  });
  const avisos = [avisoDestino, nombre !== recurso.nombre && `Ya existía "${recurso.nombre}" ahí: se restauró como "${nombre}"`].filter(Boolean);

  let restaurados = 1;
  if (Modelo === Archivo) {
    const nombreAnterior = recurso.nombre;
    recurso.carpetaId = destino?._id ?? null;
    recurso.ancestros = ubicacionDentroDe(destino, nombre).ancestros;
    recurso.nombre = nombre;
    recurso.eliminado = SIN_ELIMINAR;
    await recurso.save();
    // Si cambio el nombre, el filename de GridFS lo acompana (ver Fase 4).
    if (nombre !== nombreAnterior) {
      await renombrarContenido(recurso.gridfsId, nombre).catch((e) => console.error(`[papelera] ${e.message}`));
    }
  } else {
    // 1. Ubicacion y nombre definitivos de la carpeta y de todo su subarbol
    //    (si vuelve a la raiz, sus ancestros y rutas cambian). Si vuelve a su
    //    sitio sin cambios, el recalculo deja todo igual.
    const { ancestros, ruta } = ubicacionDentroDe(destino, nombre);
    await reubicarSubarbol(recurso, { padreId: destino?._id ?? null, ancestrosNuevos: ancestros, rutaNueva: ruta, nombreNuevo: nombre });

    // 2. Sacar de la papelera lo que se elimino JUNTO con ella (misma fecha y
    //    autor). Lo eliminado antes por separado se queda.
    const delGrupo = {
      ancestros: recurso._id,
      'eliminado.estado': true,
      'eliminado.fecha': recurso.eliminado.fecha,
      'eliminado.eliminadoPor': recurso.eliminado.eliminadoPor,
    };
    const [subcarpetas, archivos] = await Promise.all([
      Carpeta.updateMany(delGrupo, { $set: { eliminado: SIN_ELIMINAR } }),
      Archivo.updateMany(delGrupo, { $set: { eliminado: SIN_ELIMINAR } }),
    ]);
    restaurados += subcarpetas.modifiedCount + archivos.modifiedCount;

    // 3. La carpeta, al final.
    await Carpeta.updateOne({ _id: recurso._id }, { $set: { eliminado: SIN_ELIMINAR } });
  }

  await registrarActividad({
    usuarioId: usuario._id,
    accion: 'RESTAURAR',
    recursoTipo,
    recursoId: recurso._id,
    recursoNombre: nombre,
    detalle:
      `Restaurado a ${destino?.ruta ?? 'la raíz'}` +
      (restaurados > 1 ? ` con ${restaurados - 1} elementos` : '') +
      (avisos.length ? ` (${avisos.join('; ')})` : ''),
  });
  return { restaurado: true, tipo: recursoTipo, _id: recurso._id, nombre, ubicacion: destino?.ruta ?? '/', restaurados, avisos };
}

// ---------------------------------------------------------------------------
// Eliminar definitivamente
// ---------------------------------------------------------------------------

/**
 * DELETE /api/papelera/:tipo/:id — sin vuelta atras. Borra los documentos, su
 * contenido en GridFS y descuenta el espacio del propietario. En una carpeta,
 * todo su subarbol.
 *
 * Orden: primero los documentos, despues GridFS. Si fallara a medias, lo que
 * puede quedar es contenido sin documento: invisible para el usuario y
 * detectable con un $lookup (contenido.files sin archivo). Al reves quedaria
 * un archivo visible en la papelera cuyo contenido ya no existe.
 *
 * Las entradas del historial NO se borran: guardan `recursoNombre`
 * (denormalizado) justamente para seguir siendo legibles cuando el recurso
 * ya no existe.
 */
export async function eliminarDefinitivamente(tipo, id, usuario) {
  const { Modelo, recursoTipo } = leerTipo(tipo);
  const recurso = await buscar(Modelo, id, true);
  exigirPropietario(recurso, usuario, 'eliminar definitivamente este recurso');

  // Archivos y carpetas que desaparecen. En una carpeta, todo el subarbol
  // (que esta entero en la papelera: se envio en cascada).
  const archivos =
    Modelo === Archivo
      ? [recurso]
      : await Archivo.find({ ancestros: recurso._id }, { gridfsId: 1, tamano: 1 }).lean();
  const filtroCarpetas = Modelo === Carpeta ? { $or: [{ _id: recurso._id }, { ancestros: recurso._id }] } : null;

  await Archivo.deleteMany({ _id: { $in: archivos.map((a) => a._id) } });
  const carpetasBorradas = filtroCarpetas ? (await Carpeta.deleteMany(filtroCarpetas)).deletedCount : 0;

  for (const archivo of archivos) {
    await eliminarContenido(archivo.gridfsId).catch((e) =>
      console.error(`[papelera] No se pudo borrar el contenido ${archivo.gridfsId}: ${e.message}`)
    );
  }

  // Computed Pattern: ahora SI se libera el espacio (regla 5.4).
  const liberados = archivos.reduce((suma, a) => suma + a.tamano, 0);
  if (liberados) await Usuario.updateOne({ _id: recurso.propietarioId }, { $inc: { almacenamientoUsado: -liberados } });

  await registrarActividad({
    usuarioId: usuario._id,
    accion: 'ELIMINAR_DEFINITIVO',
    recursoTipo,
    recursoId: recurso._id,
    recursoNombre: recurso.nombre,
    detalle:
      Modelo === Carpeta
        ? `Eliminada con ${carpetasBorradas - 1} subcarpetas y ${archivos.length} archivos; liberados ${formatearBytes(liberados)}`
        : `Liberados ${formatearBytes(liberados)}`,
  });
  return { eliminado: true, archivos: archivos.length, carpetas: carpetasBorradas, bytesLiberados: liberados };
}
