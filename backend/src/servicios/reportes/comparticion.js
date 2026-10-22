import { Archivo, Carpeta, Usuario } from '../../modelos/index.js';
import { ErrorValidacion } from '../../utilidades/errores.js';
import { etapasPaginacion, leerEntero, leerPaginacion, respuestaPaginada } from '../../utilidades/consultas.js';
import { rechazarCamposDesconocidos } from '../../utilidades/validacion.js';
import { COLACION_NOMBRES } from '../arbol.js';
import { etapasPropietario } from './archivos.js';
import { leerUsuarioObjetivo } from './comun.js';

/**
 * Reportes de COMPARTICION (6 a 8).
 *
 * Permisos (seccion 6): el administrador ve los de todos; un usuario solo los
 * PROPIOS (lo que el comparte y lo que el recibe).
 *
 * Los tres cubren carpetas Y archivos con $unionWith: el pipeline arranca en
 * `carpetas` y $unionWith agrega al mismo flujo los documentos de `archivos`
 * (procesados por su propio sub-pipeline), como un UNION ALL de SQL. Las
 * etapas siguientes los tratan igual porque ambos embeben `compartidoCon` con
 * el mismo esquema.
 */

const USUARIOS = Usuario.collection.name;
const CARPETAS = Carpeta.collection.name;
const ARCHIVOS = Archivo.collection.name;
const TIPOS = ['CARPETA', 'ARCHIVO'];

const PROHIBIDO = 'Solo puedes consultar tus propios reportes de compartición';

/** ?tipo=CARPETA|ARCHIVO para limitar a una de las dos colecciones. */
function leerTipo(valor) {
  if (valor === undefined) return null;
  const tipo = String(valor).toUpperCase();
  if (!TIPOS.includes(tipo)) throw new ErrorValidacion(`Tipo no válido: ${valor}`, 'Usa CARPETA o ARCHIVO');
  return tipo;
}

/**
 * Etapas por coleccion: filtra, marca el tipo y calcula la ubicacion legible
 * (en una carpeta es su `ruta`; en un archivo, la ruta de su carpeta).
 */
function etapasRecurso(tipo, filtro) {
  const ubicacion =
    tipo === 'CARPETA'
      ? [{ $set: { ubicacion: '$ruta' } }]
      : [
          { $lookup: { from: CARPETAS, localField: 'carpetaId', foreignField: '_id', pipeline: [{ $project: { ruta: 1 } }], as: 'carpeta' } },
          { $set: { ubicacion: { $ifNull: [{ $first: '$carpeta.ruta' }, '/'] } } },
        ];
  return [
    { $match: { ...filtro, 'eliminado.estado': false } },
    { $set: { tipo } },
    ...ubicacion,
    { $project: { tipo: 1, nombre: 1, ubicacion: 1, propietarioId: 1, compartidoCon: 1 } },
  ];
}

/**
 * Inicio comun: recursos de ambas colecciones que cumplen `filtro`. Si se
 * pidio un solo tipo, la otra coleccion se descarta con un $match imposible
 * en vez de cambiar la forma del pipeline.
 */
function etapasUnion(filtro, tipo) {
  const filtroCarpetas = tipo === 'ARCHIVO' ? { _id: null } : filtro;
  const filtroArchivos = tipo === 'CARPETA' ? { _id: null } : filtro;
  return [
    ...etapasRecurso('CARPETA', filtroCarpetas),
    { $unionWith: { coll: ARCHIVOS, pipeline: etapasRecurso('ARCHIVO', filtroArchivos) } },
  ];
}

/** Reemplaza cada `compartidoCon.usuarioId` por {username, nombreCompleto}. */
function etapasDestinatarios() {
  return [
    {
      $lookup: {
        from: USUARIOS,
        localField: 'compartidoCon.usuarioId',
        foreignField: '_id',
        pipeline: [{ $project: { username: 1, nombreCompleto: 1 } }],
        as: 'usuariosDestino',
      },
    },
    // Cruza cada permiso con su usuario (el $lookup los trae sin orden).
    {
      $set: {
        compartidoCon: {
          $map: {
            input: '$compartidoCon',
            as: 'p',
            in: {
              usuario: {
                $first: { $filter: { input: '$usuariosDestino', cond: { $eq: ['$$this._id', '$$p.usuarioId'] } } },
              },
              nivel: '$$p.nivel',
              otorgadoEn: '$$p.otorgadoEn',
            },
          },
        },
      },
    },
    { $unset: 'usuariosDestino' },
  ];
}

/**
 * Reporte 6 — Archivos (y carpetas) compartidos con mayor cantidad de usuarios.
 * GET /api/reportes/comparticion/mas-compartidos[?tipo=ARCHIVO&limite=10]
 */
export async function recursosConMasUsuarios(consulta, usuario) {
  rechazarCamposDesconocidos(consulta, ['tipo', 'limite']);
  const tipo = leerTipo(consulta.tipo);
  const limite = leerEntero(consulta.limite, 'limite', { minimo: 1, maximo: 100, defecto: 10 });
  // Un usuario normal solo ve el ranking de SUS recursos.
  const filtro = {
    'compartidoCon.0': { $exists: true },
    ...(usuario.rol !== 'ADMINISTRADOR' && { propietarioId: usuario._id }),
  };

  return Carpeta.aggregate([
    // 1. Carpetas + archivos activos con al menos un permiso.
    ...etapasUnion(filtro, tipo),
    // 2. Con cuantos usuarios esta compartido cada uno: el largo del array
    //    embebido, sin consultar ninguna otra coleccion.
    { $set: { usuarios: { $size: '$compartidoCon' } } },
    // 3. Los mas compartidos primero; desempate alfabetico.
    { $sort: { usuarios: -1, nombre: 1 } },
    { $limit: limite },
    // 4. Nombres del propietario y de cada destinatario.
    ...etapasPropietario(),
    ...etapasDestinatarios(),
    { $project: { propietarioId: 0 } },
    // Colacion en espanol: el desempate por nombre ignora mayusculas, igual
    // que los listados ("Manuales" no va antes que "directorio" por la M).
  ]).collation(COLACION_NOMBRES);
}

/**
 * Reporte 7 — Recursos compartidos POR un usuario seleccionado.
 * GET /api/reportes/comparticion/compartidos-por?usuarioId=...[&tipo=&pagina=&limite=]
 */
export async function compartidosPorUsuario(consulta, usuario) {
  rechazarCamposDesconocidos(consulta, ['usuarioId', 'tipo', 'pagina', 'limite']);
  const objetivo = await leerUsuarioObjetivo(consulta, usuario, PROHIBIDO);
  const tipo = leerTipo(consulta.tipo);
  const paginacion = leerPaginacion(consulta);

  const resultado = await Carpeta.aggregate([
    // 1. Recursos activos del usuario con al menos un permiso
    //    (indice {propietarioId: 1, ...} de cada coleccion).
    ...etapasUnion({ propietarioId: objetivo._id, 'compartidoCon.0': { $exists: true } }, tipo),
    // 2. Cuantas personas y por que nivel, para leer el reporte de un vistazo.
    { $set: { usuarios: { $size: '$compartidoCon' } } },
    // 3. Los mas compartidos primero.
    { $sort: { usuarios: -1, nombre: 1 } },
    // 4. Pagina; los nombres de los destinatarios solo para las filas devueltas.
    ...etapasPaginacion(paginacion, [...etapasDestinatarios(), { $project: { propietarioId: 0 } }]),
  ]).collation(COLACION_NOMBRES);

  return { usuario: objetivo, ...respuestaPaginada(resultado, paginacion) };
}

/**
 * Reporte 8 — Recursos RECIBIDOS por un usuario seleccionado.
 * GET /api/reportes/comparticion/recibidos?usuarioId=...[&tipo=&pagina=&limite=]
 *
 * Son las comparticiones DIRECTAS. El acceso heredado (lo que hay dentro de
 * una carpeta recibida) no se lista recurso por recurso: se deduce de la
 * carpeta, igual que en la regla de permisos.
 */
export async function recibidosPorUsuario(consulta, usuario) {
  rechazarCamposDesconocidos(consulta, ['usuarioId', 'tipo', 'pagina', 'limite']);
  const objetivo = await leerUsuarioObjetivo(consulta, usuario, PROHIBIDO);
  const tipo = leerTipo(consulta.tipo);
  const paginacion = leerPaginacion(consulta);

  const resultado = await Carpeta.aggregate([
    // 1. Recursos activos donde el usuario aparece en compartidoCon (indice
    //    multiclave {"compartidoCon.usuarioId": 1} en ambas colecciones).
    ...etapasUnion({ 'compartidoCon.usuarioId': objetivo._id }, tipo),
    // 2. De todo el array, solo SU permiso: nivel y fecha en que lo recibio.
    {
      $set: {
        permiso: { $first: { $filter: { input: '$compartidoCon', cond: { $eq: ['$$this.usuarioId', objetivo._id] } } } },
      },
    },
    { $set: { nivel: '$permiso.nivel', recibidoEn: '$permiso.otorgadoEn', otorgadoPor: '$permiso.otorgadoPor' } },
    // 3. Lo recibido mas recientemente primero.
    { $sort: { recibidoEn: -1 } },
    // 4. Pagina, con el propietario y quien lo otorgo (puede ser un admin).
    ...etapasPaginacion(paginacion, [
      ...etapasPropietario(),
      ...etapasPropietario('otorgadoPor', 'otorgadoPor'),
      { $project: { compartidoCon: 0, permiso: 0, propietarioId: 0 } },
    ]),
  ]);

  return { usuario: objetivo, ...respuestaPaginada(resultado, paginacion) };
}
