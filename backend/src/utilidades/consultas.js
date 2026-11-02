import { ErrorValidacion } from './errores.js';

// Parametros de la URL para busqueda, reportes e historial. Se validan
// antes de llegar a MongoDB.

// Guatemala es siempre UTC-6. Las fechas sin hora se toman en hora local
// para que un archivo de las 19:00 no caiga en el dia siguiente.
export const ZONA_HORARIA = 'America/Guatemala';
const DESFASE_LOCAL = '-06:00';
const SOLO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

// "2026-05-01" -> inicio o fin del dia en hora local.
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

// ?desde y ?hasta -> {$gte, $lte}, o null si no vino ninguno.
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

export function leerPaginacion(consulta, { defecto = 50, maximo = 200 } = {}) {
  return {
    pagina: leerEntero(consulta.pagina, 'pagina', { minimo: 1, maximo: 10_000, defecto: 1 }),
    limite: leerEntero(consulta.limite, 'limite', { minimo: 1, maximo, defecto }),
  };
}

// $facet saca el total y la pagina en una sola agregacion.
// etapasPorFila (los $lookup) se aplican solo a la pagina ya cortada.
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

export function respuestaPaginada([resultado], { pagina, limite }) {
  return { total: resultado.total, pagina, limite, resultados: resultado.filas };
}
