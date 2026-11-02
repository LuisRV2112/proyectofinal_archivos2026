import { Archivo, Carpeta } from '../modelos/index.js';
import { ErrorConflicto } from '../utilidades/errores.js';

// Jerarquia de carpetas y archivos (Array of Ancestors).

// strength 2: ignora mayusculas pero no tildes.
export const COLACION_NOMBRES = { locale: 'es', strength: 2 };

// ancestros = padre.ancestros + padre. En un archivo incluye su carpeta.
export function ubicacionDentroDe(padre, nombre) {
  if (!padre) return { ancestros: [], ruta: `/${nombre}` };
  return { ancestros: [...padre.ancestros, padre._id], ruta: `${padre.ruta}/${nombre}` };
}

// Dos hermanos no pueden llamarse igual. No es indice unico porque lo que
// esta en la papelera si puede repetir nombre y hay que ignorar mayusculas.
export async function validarNombreLibre(Modelo, campoPadre, { propietarioId, padreId, nombre, excluirId = null }) {
  const filtro = {
    propietarioId,
    [campoPadre]: padreId ?? null,
    nombre,
    'eliminado.estado': false,
  };
  if (excluirId) filtro._id = { $ne: excluirId };

  const choca = await Modelo.exists(filtro).collation(COLACION_NOMBRES);
  if (choca) {
    const tipo = Modelo === Carpeta ? 'una carpeta llamada' : 'un archivo llamado';
    throw new ErrorConflicto(`Ya existe ${tipo} "${nombre}" en esa ubicación`);
  }
}

// Actualiza ancestros y ruta de todo el subarbol al mover o renombrar.
// Es el costo del patron.
// 1. Subarbol con {ancestros: id}, incluida la papelera.
// 2. ancestros nuevos = ancestrosNuevos + tramo desde la carpeta hacia abajo.
// 3. La ruta se rehace con los nombres.
// 4. bulkWrite: un solo viaje por coleccion.
// Sin replica set no hay transacciones, por eso la carpeta se escribe al
// final: si algo falla, repetir la operacion lo corrige.
export async function reubicarSubarbol(carpeta, { padreId, ancestrosNuevos, rutaNueva, nombreNuevo }) {
  const [subcarpetas, archivos] = await Promise.all([
    Carpeta.find({ ancestros: carpeta._id }, { nombre: 1, ancestros: 1 }).lean(),
    Archivo.find({ ancestros: carpeta._id }, { ancestros: 1 }).lean(),
  ]);

  const nombres = new Map(subcarpetas.map((c) => [String(c._id), c.nombre]));

  // Desde la carpeta movida (incluida) hacia abajo.
  const tramoInferior = (ancestros) => ancestros.slice(ancestros.findIndex((id) => id.equals(carpeta._id)));
  const reubicar = (ancestros) => [...ancestrosNuevos, ...tramoInferior(ancestros)];

  const rutaDe = (sub) => {
    const intermedios = tramoInferior(sub.ancestros).slice(1).map((id) => nombres.get(String(id)));
    return [rutaNueva, ...intermedios, sub.nombre].join('/');
  };

  const opsArchivos = archivos.map((a) => ({
    updateOne: { filter: { _id: a._id }, update: { $set: { ancestros: reubicar(a.ancestros) } } },
  }));
  const opsCarpetas = subcarpetas.map((c) => ({
    updateOne: { filter: { _id: c._id }, update: { $set: { ancestros: reubicar(c.ancestros), ruta: rutaDe(c) } } },
  }));
  // La carpeta va al final.
  opsCarpetas.push({
    updateOne: {
      filter: { _id: carpeta._id },
      update: { $set: { padreId, ancestros: ancestrosNuevos, ruta: rutaNueva, nombre: nombreNuevo } },
    },
  });

  if (opsArchivos.length) await Archivo.bulkWrite(opsArchivos);
  await Carpeta.bulkWrite(opsCarpetas);

  return subcarpetas.length + archivos.length;
}

// Al restaurar, si el nombre ya esta ocupado se usa "nombre (2).ext".
export async function primerNombreLibre(Modelo, campoPadre, { propietarioId, padreId, nombre, excluirId = null }) {
  const punto = Modelo === Archivo ? nombre.lastIndexOf('.') : -1;
  const base = punto > 0 ? nombre.slice(0, punto) : nombre;
  const extension = punto > 0 ? nombre.slice(punto) : '';

  for (let n = 1; ; n++) {
    const candidato = n === 1 ? nombre : `${base} (${n})${extension}`;
    const filtro = { propietarioId, [campoPadre]: padreId ?? null, nombre: candidato, 'eliminado.estado': false };
    if (excluirId) filtro._id = { $ne: excluirId };
    if (!(await Modelo.exists(filtro).collation(COLACION_NOMBRES))) return candidato;
  }
}
