import { Archivo, Carpeta, Usuario } from '../modelos/index.js';
import { eliminarContenido, renombrarContenido } from '../config/gridfs.js';
import { ErrorNoEncontrado, ErrorValidacion } from '../utilidades/errores.js';
import { formatearBytes } from '../utilidades/formato.js';
import { exigirObjectId } from '../utilidades/validacion.js';
import { registrarActividad } from './actividad.js';
import { primerNombreLibre, reubicarSubarbol, ubicacionDentroDe } from './arbol.js';
import { exigirPropietario } from './permisos.js';

// Eliminar solo marca eliminado.estado; los listados lo filtran.
// El subarbol de una carpeta recibe la misma fecha y autor, asi al
// restaurarla vuelve solo lo que se elimino con ella.
// Solo el propietario usa su papelera.

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

// Enviar a la papelera

// DELETE /api/archivos/:id
export async function enviarArchivoAPapelera(id, usuario) {
  const archivo = await buscar(Archivo, id, false);
  exigirPropietario(archivo, usuario, 'enviar este archivo a la papelera');

  // carpetaId y ancestros no cambian. El espacio no se libera todavia.
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

// DELETE /api/carpetas/:id, en cascada con {ancestros: id}.
// El update es un pipeline para copiar padreOriginalId desde el propio
// documento ($padreId / $carpetaId) sin traerlo a la aplicacion.
// Lo que ya estaba en la papelera no se toca.
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

  // Driver nativo para enviar el pipeline tal cual.
  const [subcarpetas, archivos] = await Promise.all([
    Carpeta.collection.updateMany(subarbolActivo, marca('padreId')),
    Archivo.collection.updateMany(subarbolActivo, marca('carpetaId')),
  ]);
  // La carpeta al final, para poder repetir si algo falla.
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

// Listar

// GET /api/papelera. Solo muestra la raiz de cada eliminacion con un
// resumen de lo que contiene.
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
    bytesOcupados: archivos.reduce((suma, a) => suma + a.tamano, 0),
  };
}

// Restaurar

// Carpeta original si sigue activa; si no, la raiz con un aviso.
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

// POST /api/papelera/:tipo/:id/restaurar
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
    if (nombre !== nombreAnterior) {
      await renombrarContenido(recurso.gridfsId, nombre).catch((e) => console.error(`[papelera] ${e.message}`));
    }
  } else {
    // 1. Recalcular ancestros y rutas por si vuelve a la raiz.
    const { ancestros, ruta } = ubicacionDentroDe(destino, nombre);
    await reubicarSubarbol(recurso, { padreId: destino?._id ?? null, ancestrosNuevos: ancestros, rutaNueva: ruta, nombreNuevo: nombre });

    // 2. Restaurar lo que se elimino con ella (misma fecha y autor).
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

    // 3. La carpeta al final.
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

// Eliminar definitivamente

// DELETE /api/papelera/:tipo/:id. Borra documentos, contenido en GridFS y
// descuenta el espacio.
// Primero los documentos: si falla a medias queda contenido invisible, no
// un archivo visible sin contenido. El historial se conserva.
export async function eliminarDefinitivamente(tipo, id, usuario) {
  const { Modelo, recursoTipo } = leerTipo(tipo);
  const recurso = await buscar(Modelo, id, true);
  exigirPropietario(recurso, usuario, 'eliminar definitivamente este recurso');

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

  // Ahora si se libera el espacio.
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
