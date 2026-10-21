import { Archivo, Carpeta, Usuario } from '../../modelos/index.js';
import { leerBooleano, leerEntero } from '../../utilidades/consultas.js';
import { rechazarCamposDesconocidos } from '../../utilidades/validacion.js';

/**
 * Reportes de USUARIOS (4 y 5). Solo administrador.
 */

const USUARIOS = Usuario.collection.name;
const ARCHIVOS = Archivo.collection.name;

// Datos del usuario que se muestran en los reportes (nunca el passwordHash).
const DATOS_USUARIO = { username: 1, nombreCompleto: 1, rol: 1, activo: 1, almacenamientoUsado: 1 };

/**
 * Reporte 4 — Top 10 usuarios con mayor cantidad de archivos almacenados.
 * GET /api/reportes/usuarios/top-archivos[?incluirPapelera=false&limite=10]
 */
export async function topUsuariosPorArchivos(consulta) {
  rechazarCamposDesconocidos(consulta, ['incluirPapelera', 'limite']);
  const incluirPapelera = leerBooleano(consulta.incluirPapelera, 'incluirPapelera', true);
  const limite = leerEntero(consulta.limite, 'limite', { minimo: 1, maximo: 100, defecto: 10 });

  return Archivo.aggregate([
    // 1. Archivos almacenados (los de la papelera tambien ocupan espacio).
    { $match: incluirPapelera ? {} : { 'eliminado.estado': false } },
    // 2. Un grupo por propietario: cuantos archivos, de que tipo y cuantos bytes.
    {
      $group: {
        _id: '$propietarioId',
        archivos: { $sum: 1 },
        md: { $sum: { $cond: [{ $eq: ['$extension', 'md'] }, 1, 0] } },
        txt: { $sum: { $cond: [{ $eq: ['$extension', 'txt'] }, 1, 0] } },
        enPapelera: { $sum: { $cond: ['$eliminado.estado', 1, 0] } },
        bytes: { $sum: '$tamano' },
      },
    },
    // 3. De mayor a menor cantidad; a igual cantidad, el que ocupa mas.
    { $sort: { archivos: -1, bytes: -1 } },
    // 4. Solo los primeros N (10 por defecto).
    { $limit: limite },
    // 5. Posicion en el ranking: se juntan las filas YA ordenadas en un array
    //    y al desarmarlo $unwind entrega el indice de cada una (0, 1, 2...).
    //    ($documentNumber no sirve aqui: exige ordenar por un solo campo, y
    //    este ranking desempata por bytes.)
    { $group: { _id: null, filas: { $push: '$$ROOT' } } },
    { $unwind: { path: '$filas', includeArrayIndex: 'indice' } },
    { $replaceWith: { $mergeObjects: ['$filas', { posicion: { $add: ['$indice', 1] } }] } },
    // 6. Datos del usuario.
    { $lookup: { from: USUARIOS, localField: '_id', foreignField: '_id', pipeline: [{ $project: DATOS_USUARIO }], as: 'usuario' } },
    { $unwind: '$usuario' },
    // 7. Forma final.
    {
      $project: {
        _id: 0,
        posicion: 1,
        usuarioId: '$_id',
        username: '$usuario.username',
        nombreCompleto: '$usuario.nombreCompleto',
        activo: '$usuario.activo',
        archivos: 1,
        porTipo: { md: '$md', txt: '$txt' },
        enPapelera: 1,
        bytes: 1,
        // El valor denormalizado (Computed Pattern), para contrastar.
        almacenamientoUsado: '$usuario.almacenamientoUsado',
      },
    },
    // $lookup no garantiza conservar el orden: se reafirma.
    { $sort: { posicion: 1 } },
  ]);
}

/**
 * Etapas comunes para "recursos compartidos": de un recurso (carpeta o
 * archivo) activo con al menos un permiso, deja su dueno, su tipo y a quienes
 * se compartio. Se aplican igual sobre `carpetas` y, via $unionWith, sobre
 * `archivos`.
 */
function etapasRecursosCompartidos(tipo) {
  return [
    // `compartidoCon.0` existe solo si el array tiene al menos un elemento.
    { $match: { 'eliminado.estado': false, 'compartidoCon.0': { $exists: true } } },
    {
      $project: {
        propietarioId: 1,
        tipo: { $literal: tipo },
        permisos: { $size: '$compartidoCon' },
        destinatarios: '$compartidoCon.usuarioId',
      },
    },
  ];
}

/**
 * Reporte 5 — Usuarios con mayor cantidad de recursos compartidos.
 * GET /api/reportes/usuarios/mas-compartidos[?limite=10]
 *
 * "Recursos" son carpetas Y archivos: $unionWith junta ambas colecciones en
 * el mismo flujo de documentos, como un UNION ALL, y el resto del pipeline
 * los trata igual.
 */
export async function usuariosConMasCompartidos(consulta) {
  rechazarCamposDesconocidos(consulta, ['limite']);
  const limite = leerEntero(consulta.limite, 'limite', { minimo: 1, maximo: 100, defecto: 10 });

  return Carpeta.aggregate([
    // 1. Carpetas activas compartidas...
    ...etapasRecursosCompartidos('CARPETA'),
    // 2. ...mas los archivos activos compartidos, en el mismo flujo.
    { $unionWith: { coll: ARCHIVOS, pipeline: etapasRecursosCompartidos('ARCHIVO') } },
    // 3. Un grupo por propietario.
    {
      $group: {
        _id: '$propietarioId',
        recursos: { $sum: 1 },
        carpetas: { $sum: { $cond: [{ $eq: ['$tipo', 'CARPETA'] }, 1, 0] } },
        archivos: { $sum: { $cond: [{ $eq: ['$tipo', 'ARCHIVO'] }, 1, 0] } },
        permisosOtorgados: { $sum: '$permisos' },
        // Un array de destinatarios por recurso; se unen en el paso 4.
        destinatarios: { $push: '$destinatarios' },
      },
    },
    // 4. Con cuantas personas DISTINTAS comparte: union de todos los arrays.
    {
      $set: {
        usuariosDistintos: {
          $size: { $reduce: { input: '$destinatarios', initialValue: [], in: { $setUnion: ['$$value', '$$this'] } } },
        },
      },
    },
    // 5. Ranking y corte.
    { $sort: { recursos: -1, permisosOtorgados: -1 } },
    { $limit: limite },
    // 6. Datos del usuario y forma final.
    { $lookup: { from: USUARIOS, localField: '_id', foreignField: '_id', pipeline: [{ $project: DATOS_USUARIO }], as: 'usuario' } },
    { $unwind: '$usuario' },
    {
      $project: {
        _id: 0,
        usuarioId: '$_id',
        username: '$usuario.username',
        nombreCompleto: '$usuario.nombreCompleto',
        recursos: 1,
        carpetas: 1,
        archivos: 1,
        permisosOtorgados: 1,
        usuariosDistintos: 1,
      },
    },
  ]);
}
