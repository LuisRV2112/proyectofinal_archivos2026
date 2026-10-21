import { Archivo, Carpeta, EXTENSIONES_PERMITIDAS } from '../modelos/index.js';
import { ErrorNoEncontrado, ErrorValidacion } from '../utilidades/errores.js';
import { exigirObjectId, rechazarCamposDesconocidos } from '../utilidades/validacion.js';
import { carpetasCompartidasCon, exigirNivel } from './permisos.js';

const PARAMETROS = ['texto', 'extension', 'carpetaId', 'enSubarbol', 'desde', 'hasta', 'propietarioId', 'pagina', 'limite'];
const LIMITE_POR_DEFECTO = 50;
const LIMITE_MAXIMO = 200;

// Guatemala no tiene horario de verano: una fecha sin hora ("2026-05-01") se
// interpreta como el dia completo en hora local, no en UTC. Si no, un
// archivo subido el 30 de abril a las 19:00 (01:00 UTC del 1 de mayo)
// apareceria en el dia equivocado.
const DESFASE_LOCAL = '-06:00';
const SOLO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** "2026-05-01" -> inicio (o fin) de ese dia en hora local; ISO completo tal cual. */
function leerFecha(valor, campo, finDelDia) {
  const texto = String(valor);
  const fecha = SOLO_FECHA.test(texto)
    ? new Date(`${texto}T${finDelDia ? '23:59:59.999' : '00:00:00.000'}${DESFASE_LOCAL}`)
    : new Date(texto);
  if (Number.isNaN(fecha.getTime())) {
    throw new ErrorValidacion(`La fecha "${campo}" no es válida`, 'Usa el formato AAAA-MM-DD o una fecha ISO 8601');
  }
  return fecha;
}

function leerEntero(valor, campo, { minimo, maximo, defecto }) {
  if (valor === undefined) return defecto;
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero < minimo || numero > maximo) {
    throw new ErrorValidacion(`"${campo}" debe ser un entero entre ${minimo} y ${maximo}`);
  }
  return numero;
}

function leerBooleano(valor, campo) {
  if (valor === undefined) return false;
  if (valor === 'true') return true;
  if (valor === 'false') return false;
  throw new ErrorValidacion(`"${campo}" debe ser true o false`);
}

/**
 * GET /api/archivos/buscar — filtros combinables (todos opcionales):
 *
 *   texto          palabras en el nombre o en las etiquetas (indice de texto)
 *   extension      txt | md
 *   carpetaId      solo los archivos directos de esa carpeta...
 *   enSubarbol     ...o, con true, tambien los de todas sus subcarpetas
 *   desde, hasta   rango sobre creadoEn
 *   propietarioId  solo los de ese propietario (dentro de lo accesible)
 *   pagina, limite paginacion
 *
 * Cada filtro se traduce a una condicion sobre un campo indexado, y MongoDB
 * combina las condiciones con AND.
 */
export async function buscarArchivos(consulta, usuario) {
  rechazarCamposDesconocidos(consulta, PARAMETROS);

  // Siempre: nada de la papelera.
  const filtro = { 'eliminado.estado': false };

  // Alcance segun permisos: un usuario busca entre lo que puede LEER, que es
  // la union de las vias de acceso de la regla 5.2:
  //   - lo suyo                                  {propietarioId: yo}
  //   - lo compartido directamente con el        {"compartidoCon.usuarioId": yo}
  //   - lo que esta dentro de una carpeta que le
  //     compartieron (herencia)                  {ancestros: {$in: [esas carpetas]}}
  // Las tres ramas del $or usan un indice cada una, requisito de MongoDB para
  // combinar $or con una busqueda $text. El administrador busca entre todo.
  if (usuario.rol !== 'ADMINISTRADOR') {
    const compartidas = await carpetasCompartidasCon(usuario);
    filtro.$or = [
      { propietarioId: usuario._id },
      { 'compartidoCon.usuarioId': usuario._id },
      ...(compartidas.length ? [{ ancestros: { $in: compartidas.map((c) => c._id) } }] : []),
    ];
  }
  if (consulta.propietarioId !== undefined) filtro.propietarioId = exigirObjectId(consulta.propietarioId, 'propietarioId');

  // Busqueda por texto con el indice {nombre: "text", etiquetas: "text"} en
  // espanol: busca PALABRAS completas (con raices: "contratos" encuentra
  // "contrato"), no fragmentos. Los guiones y puntos del nombre separan
  // palabras, asi que "acta" encuentra "acta-comite-legal.txt".
  if (consulta.texto !== undefined) {
    const texto = String(consulta.texto).trim();
    if (!texto) throw new ErrorValidacion('El parámetro "texto" no puede estar vacío');
    filtro.$text = { $search: texto };
  }

  if (consulta.extension !== undefined) {
    const extension = String(consulta.extension).toLowerCase().replace(/^\./, '');
    if (!EXTENSIONES_PERMITIDAS.includes(extension)) {
      throw new ErrorValidacion(`Extensión no válida: ${consulta.extension}`, `Valores aceptados: ${EXTENSIONES_PERMITIDAS.join(', ')}`);
    }
    filtro.extension = extension;
  }

  const enSubarbol = leerBooleano(consulta.enSubarbol, 'enSubarbol');
  if (consulta.carpetaId !== undefined) {
    const carpeta = await Carpeta.findOne({ _id: exigirObjectId(consulta.carpetaId, 'carpetaId'), 'eliminado.estado': false });
    if (!carpeta) throw new ErrorNoEncontrado('Carpeta no encontrada', 'No existe o está en la papelera');
    await exigirNivel(carpeta, usuario, 'LECTURA');

    // Aqui se ve la ventaja de Array of Ancestors: "todo lo que esta debajo
    // de X, a cualquier profundidad" es una igualdad sobre un array
    // indexado ({ancestros: X}), sin recorrer el arbol. Funciona porque el
    // `ancestros` de un archivo incluye su propia carpeta.
    if (enSubarbol) filtro.ancestros = carpeta._id;
    else filtro.carpetaId = carpeta._id;
  } else if (enSubarbol) {
    throw new ErrorValidacion('"enSubarbol" requiere "carpetaId"');
  }

  if (consulta.desde !== undefined || consulta.hasta !== undefined) {
    filtro.creadoEn = {};
    if (consulta.desde !== undefined) filtro.creadoEn.$gte = leerFecha(consulta.desde, 'desde', false);
    if (consulta.hasta !== undefined) filtro.creadoEn.$lte = leerFecha(consulta.hasta, 'hasta', true);
    if (filtro.creadoEn.$gte && filtro.creadoEn.$lte && filtro.creadoEn.$gte > filtro.creadoEn.$lte) {
      throw new ErrorValidacion('"desde" no puede ser posterior a "hasta"');
    }
  }

  const pagina = leerEntero(consulta.pagina, 'pagina', { minimo: 1, maximo: 10_000, defecto: 1 });
  const limite = leerEntero(consulta.limite, 'limite', { minimo: 1, maximo: LIMITE_MAXIMO, defecto: LIMITE_POR_DEFECTO });

  // Con texto, primero lo mas relevante (puntaje del indice de texto); sin
  // texto, lo mas reciente (indice {creadoEn: -1}).
  const proyeccion = filtro.$text ? { gridfsId: 0, relevancia: { $meta: 'textScore' } } : { gridfsId: 0 };
  const orden = filtro.$text ? { relevancia: { $meta: 'textScore' }, creadoEn: -1 } : { creadoEn: -1 };

  const [total, resultados] = await Promise.all([
    Archivo.countDocuments(filtro),
    Archivo.find(filtro, proyeccion)
      .sort(orden)
      .skip((pagina - 1) * limite)
      .limit(limite)
      .lean(),
  ]);

  // La ubicacion legible de cada resultado: una sola consulta por las
  // carpetas distintas de la pagina, no una por archivo.
  const idsCarpetas = [...new Set(resultados.filter((a) => a.carpetaId).map((a) => String(a.carpetaId)))];
  const carpetas = await Carpeta.find({ _id: { $in: idsCarpetas } }, { ruta: 1 }).lean();
  const rutas = new Map(carpetas.map((c) => [String(c._id), c.ruta]));
  for (const archivo of resultados) {
    delete archivo.__v;
    archivo.ubicacion = archivo.carpetaId ? rutas.get(String(archivo.carpetaId)) : '/';
  }

  return { total, pagina, limite, resultados };
}
