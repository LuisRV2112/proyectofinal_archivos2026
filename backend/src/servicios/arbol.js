import { Archivo, Carpeta } from '../modelos/index.js';
import { ErrorConflicto } from '../utilidades/errores.js';

/**
 * Operaciones sobre la jerarquia que comparten carpetas y archivos, todas
 * basadas en el patron ARRAY OF ANCESTORS (ver modelos/Carpeta.js).
 */

/**
 * Comparacion de nombres sin distinguir mayusculas: "Contratos" y
 * "contratos" chocan. strength 2 = compara letras y tildes, ignora
 * mayusculas; "Informacion" e "Información" se consideran distintos, igual
 * que en el seed.
 */
export const COLACION_NOMBRES = { locale: 'es', strength: 2 };

/**
 * Ubicacion de un elemento que va dentro de `padre` (o en la raiz si es
 * null): sus ancestros son los del padre mas el padre, y la ruta legible se
 * arma igual.
 *
 * Para un ARCHIVO dentro de la carpeta C, `ancestros` = esta misma lista, que
 * ya incluye a C: eso es lo que permite que {ancestros: C} traiga tambien sus
 * archivos directos.
 */
export function ubicacionDentroDe(padre, nombre) {
  if (!padre) return { ancestros: [], ruta: `/${nombre}` };
  return { ancestros: [...padre.ancestros, padre._id], ruta: `${padre.ruta}/${nombre}` };
}

/**
 * Regla 5.1 / 5.5: dos hermanos no pueden llamarse igual.
 *
 * No es un indice unico porque los elementos en la papelera si pueden repetir
 * nombre (se elimina "acta.md" y se sube otro "acta.md"), y un indice unico
 * parcial no admite comparar sin mayusculas. Se valida aqui, contra los
 * hermanos NO eliminados del mismo propietario.
 *
 * @param Modelo     Carpeta o Archivo
 * @param campoPadre 'padreId' (carpetas) o 'carpetaId' (archivos)
 */
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

/**
 * Reescribe `ancestros` y `ruta` de TODO el subarbol de una carpeta, despues
 * de moverla o renombrarla. Es el precio del patron Array of Ancestors: cada
 * descendiente guarda una copia del camino desde la raiz, asi que si el
 * camino cambia hay que actualizar todas las copias. Se acepta porque mover y
 * renombrar carpetas es raro, mientras que listar, buscar en un subarbol y
 * comprobar permisos heredados (lo que el patron hace barato) es constante.
 *
 * Pasos:
 *
 * 1. Traer el subarbol: {ancestros: carpetaId} en carpetas y en archivos. Una
 *    consulta indexada por coleccion (indice multiclave), sin recursion, a
 *    cualquier profundidad. Incluye lo que esta en la papelera: si luego se
 *    restaura, tiene que volver con su camino correcto.
 *
 * 2. Recalcular `ancestros` de cada descendiente. Su array tiene dos tramos:
 *       [ ...por encima de la carpeta... , carpeta, ...por debajo... ]
 *    El tramo de arriba es el que cambio (al mover); el de abajo sigue
 *    igual. Se reemplaza el primero por los ancestros nuevos de la carpeta y
 *    se conserva el segundo desde la propia carpeta:
 *       nuevo = [...ancestrosNuevos, ...ancestros.slice(posicionDeLaCarpeta)]
 *
 * 3. Recalcular `ruta` (solo carpetas; los archivos no la guardan). Se arma
 *    desde los nombres en vez de recortar la ruta vieja con un prefijo, asi el
 *    resultado no depende de que la ruta anterior estuviera bien: es
 *    rutaNueva + nombres de los ancestros por debajo de la carpeta + nombre.
 *
 * 4. Escribir con bulkWrite: todas las actualizaciones viajan en un solo
 *    viaje por coleccion, en vez de un updateOne por documento.
 *
 * Atomicidad: el MongoDB del proyecto es un servidor independiente (sin
 * replica set), donde no hay transacciones de varios documentos. Para que un
 * fallo a medias se corrija simplemente repitiendo la operacion, la propia
 * carpeta se escribe AL FINAL: mientras no se escriba, la operacion "no ha
 * ocurrido" para quien la mire, y el calculo de los pasos 2 y 3 da el mismo
 * resultado sin importar si un descendiente ya se habia actualizado o no.
 *
 * @returns cantidad de descendientes reubicados (carpetas + archivos)
 */
export async function reubicarSubarbol(carpeta, { padreId, ancestrosNuevos, rutaNueva, nombreNuevo }) {
  const [subcarpetas, archivos] = await Promise.all([
    Carpeta.find({ ancestros: carpeta._id }, { nombre: 1, ancestros: 1 }).lean(),
    Archivo.find({ ancestros: carpeta._id }, { ancestros: 1 }).lean(),
  ]);

  // Nombres de las subcarpetas, para rehacer rutas sin mas consultas.
  const nombres = new Map(subcarpetas.map((c) => [String(c._id), c.nombre]));

  // Tramo de abajo: desde la carpeta movida (incluida) hasta el final.
  const tramoInferior = (ancestros) => ancestros.slice(ancestros.findIndex((id) => id.equals(carpeta._id)));
  const reubicar = (ancestros) => [...ancestrosNuevos, ...tramoInferior(ancestros)];

  const rutaDe = (sub) => {
    // Ancestros por debajo de la carpeta movida (sin incluirla).
    const intermedios = tramoInferior(sub.ancestros).slice(1).map((id) => nombres.get(String(id)));
    return [rutaNueva, ...intermedios, sub.nombre].join('/');
  };

  const opsArchivos = archivos.map((a) => ({
    updateOne: { filter: { _id: a._id }, update: { $set: { ancestros: reubicar(a.ancestros) } } },
  }));
  const opsCarpetas = subcarpetas.map((c) => ({
    updateOne: { filter: { _id: c._id }, update: { $set: { ancestros: reubicar(c.ancestros), ruta: rutaDe(c) } } },
  }));
  // La carpeta en si, la ultima (ver "Atomicidad").
  opsCarpetas.push({
    updateOne: {
      filter: { _id: carpeta._id },
      update: { $set: { padreId, ancestros: ancestrosNuevos, ruta: rutaNueva, nombre: nombreNuevo } },
    },
  });

  // ordered: true (por defecto) garantiza que se aplican en ese orden.
  if (opsArchivos.length) await Archivo.bulkWrite(opsArchivos);
  await Carpeta.bulkWrite(opsCarpetas);

  return subcarpetas.length + archivos.length;
}
