import { Archivo, Carpeta, EXTENSIONES_PERMITIDAS } from '../modelos/index.js';
import { ErrorNoEncontrado, ErrorValidacion } from '../utilidades/errores.js';
import { exigirObjectId, rechazarCamposDesconocidos } from '../utilidades/validacion.js';
import { leerBooleano, leerPaginacion, leerRangoFechas } from '../utilidades/consultas.js';
import { carpetasCompartidasCon, exigirNivel } from './permisos.js';

const PARAMETROS = ['texto', 'extension', 'carpetaId', 'enSubarbol', 'desde', 'hasta', 'propietarioId', 'pagina', 'limite'];

// GET /api/archivos/buscar. Todos los filtros son opcionales y se combinan con AND.
export async function buscarArchivos(consulta, usuario) {
  rechazarCamposDesconocidos(consulta, PARAMETROS);

  const filtro = { 'eliminado.estado': false };

  // Lo que puede leer: lo suyo, lo compartido directo y lo heredado.
  // Cada rama del $or tiene indice, MongoDB lo exige para usarlo con $text.
  if (usuario.rol !== 'ADMINISTRADOR') {
    const compartidas = await carpetasCompartidasCon(usuario);
    filtro.$or = [
      { propietarioId: usuario._id },
      { 'compartidoCon.usuarioId': usuario._id },
      ...(compartidas.length ? [{ ancestros: { $in: compartidas.map((c) => c._id) } }] : []),
    ];
  }
  if (consulta.propietarioId !== undefined) filtro.propietarioId = exigirObjectId(consulta.propietarioId, 'propietarioId');

  // Busca palabras completas, no fragmentos. Los guiones separan palabras.
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

    // Todo el subarbol con {ancestros: X}, sin recorrer el arbol.
    if (enSubarbol) filtro.ancestros = carpeta._id;
    else filtro.carpetaId = carpeta._id;
  } else if (enSubarbol) {
    throw new ErrorValidacion('"enSubarbol" requiere "carpetaId"');
  }

  const rangoFechas = leerRangoFechas(consulta);
  if (rangoFechas) filtro.creadoEn = rangoFechas;

  const { pagina, limite } = leerPaginacion(consulta);

  // Con texto por relevancia, sin texto por fecha.
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

  // Una consulta para las carpetas de la pagina, no una por archivo.
  const idsCarpetas = [...new Set(resultados.filter((a) => a.carpetaId).map((a) => String(a.carpetaId)))];
  const carpetas = await Carpeta.find({ _id: { $in: idsCarpetas } }, { ruta: 1 }).lean();
  const rutas = new Map(carpetas.map((c) => [String(c._id), c.ruta]));
  for (const archivo of resultados) {
    delete archivo.__v;
    archivo.ubicacion = archivo.carpetaId ? rutas.get(String(archivo.carpetaId)) : '/';
  }

  return { total, pagina, limite, resultados };
}
