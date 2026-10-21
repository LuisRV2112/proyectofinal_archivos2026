import { ErrorValidacion } from './errores.js';

/**
 * Lectura de parametros de consulta (?desde=...&pagina=...) comunes a la
 * busqueda, los reportes y el historial. Todo llega como texto en la URL; se
 * convierte y valida aqui ANTES de armar el filtro o el pipeline, para que un
 * valor invalido de 400 con un mensaje claro y nunca llegue a MongoDB.
 */

// Guatemala no tiene horario de verano: siempre UTC-6. Una fecha sin hora
// ("2026-05-01") se interpreta como el dia completo en hora local, no en
// UTC. Si no, un archivo subido el 30 de abril a las 19:00 (01:00 UTC del 1
// de mayo) apareceria en el dia equivocado.
export const ZONA_HORARIA = 'America/Guatemala';
const DESFASE_LOCAL = '-06:00';
const SOLO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** "2026-05-01" -> inicio (o fin) de ese dia en hora local; ISO completo tal cual. */
export function leerFecha(valor, campo, finDelDia) {
  const texto = String(valor);
  const fecha = SOLO_FECHA.test(texto)
    ? new Date(`${texto}T${finDelDia ? '23:59:59.999' : '00:00:00.000'}${DESFASE_LOCAL}`)
    : new Date(texto);
  if (Number.isNaN(fecha.getTime())) {
    throw new ErrorValidacion(`La fecha "${campo}" no es válida`, 'Usa el formato AAAA-MM-DD o una fecha ISO 8601');
  }
  return fecha;
}

/**
 * ?desde y ?hasta (opcionales) -> condicion {$gte, $lte} lista para un $match,
 * o null si no vino ninguno.
 */
export function leerRangoFechas(consulta, { obligatorio = false } = {}) {
  const { desde, hasta } = consulta;
  if (desde === undefined && hasta === undefined) {
    if (obligatorio) throw new ErrorValidacion('Indica el rango con "desde" y/o "hasta"', 'Formato AAAA-MM-DD');
    return null;
  }
  const rango = {};
  if (desde !== undefined) rango.$gte = leerFecha(desde, 'desde', false);
  if (hasta !== undefined) rango.$lte = leerFecha(hasta, 'hasta', true);
  if (rango.$gte && rango.$lte && rango.$gte > rango.$lte) {
    throw new ErrorValidacion('"desde" no puede ser posterior a "hasta"');
  }
  return rango;
}

export function leerEntero(valor, campo, { minimo, maximo, defecto }) {
  if (valor === undefined) return defecto;
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero < minimo || numero > maximo) {
    throw new ErrorValidacion(`"${campo}" debe ser un entero entre ${minimo} y ${maximo}`);
  }
  return numero;
}

export function leerBooleano(valor, campo, defecto = false) {
  if (valor === undefined) return defecto;
  if (valor === 'true') return true;
  if (valor === 'false') return false;
  throw new ErrorValidacion(`"${campo}" debe ser true o false`);
}

/** ?pagina y ?limite con sus topes. */
export function leerPaginacion(consulta, { defecto = 50, maximo = 200 } = {}) {
  return {
    pagina: leerEntero(consulta.pagina, 'pagina', { minimo: 1, maximo: 10_000, defecto: 1 }),
    limite: leerEntero(consulta.limite, 'limite', { minimo: 1, maximo, defecto }),
  };
}

/**
 * Etapa final de un pipeline paginado. $facet ejecuta dos sub-pipelines
 * sobre los MISMOS documentos de entrada: uno cuenta el total y el otro corta
 * la pagina. Asi el total y la pagina salen de una sola agregacion, sin
 * repetir todo el $match en un countDocuments aparte.
 *
 * `etapasPorFila` se aplican solo a la pagina ya cortada: es el lugar para
 * los $lookup, que asi cruzan 50 filas y no todo el resultado.
 */
export function etapasPaginacion({ pagina, limite }, etapasPorFila = []) {
  return [
    {
      $facet: {
        total: [{ $count: 'n' }],
        filas: [{ $skip: (pagina - 1) * limite }, { $limit: limite }, ...etapasPorFila],
      },
    },
    // {total: [{n: 37}], filas: [...]} -> {total: 37, filas: [...]}
    { $project: { total: { $ifNull: [{ $first: '$total.n' }, 0] }, filas: 1 } },
  ];
}

/** Resultado de un pipeline con etapasPaginacion() -> respuesta de la API. */
export function respuestaPaginada([resultado], { pagina, limite }) {
  return { total: resultado.total, pagina, limite, resultados: resultado.filas };
}
