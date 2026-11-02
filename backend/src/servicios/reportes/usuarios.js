import { Archivo, Carpeta, Usuario } from '../../modelos/index.js';
import { leerBooleano, leerEntero } from '../../utilidades/consultas.js';
import { rechazarCamposDesconocidos } from '../../utilidades/validacion.js';

// Reportes de usuarios (4 y 5). Solo administrador.

const USUARIOS = Usuario.collection.name;
const ARCHIVOS = Archivo.collection.name;

const DATOS_USUARIO = { username: 1, nombreCompleto: 1, rol: 1, activo: 1, almacenamientoUsado: 1 };

// Reporte 4: top usuarios por cantidad de archivos.
export async function topUsuariosPorArchivos(consulta) {
  rechazarCamposDesconocidos(consulta, ['incluirPapelera', 'limite']);
  const incluirPapelera = leerBooleano(consulta.incluirPapelera, 'incluirPapelera', true);
  const limite = leerEntero(consulta.limite, 'limite', { minimo: 1, maximo: 100, defecto: 10 });

  return Archivo.aggregate([
    // 1. Con o sin papelera.
    { $match: incluirPapelera ? {} : { 'eliminado.estado': false } },
    // 2. Agrupar por propietario.
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
    // 3. Ordenar; empate por bytes.
    { $sort: { archivos: -1, bytes: -1 } },
    // 4. Top N.
    { $limit: limite },
    // 5. Posicion: includeArrayIndex de $unwind. $documentNumber no sirve
    //    porque exige ordenar por un solo campo.
    { $group: { _id: null, filas: { $push: '$$ROOT' } } },
    { $unwind: { path: '$filas', includeArrayIndex: 'indice' } },
    { $replaceWith: { $mergeObjects: ['$filas', { posicion: { $add: ['$indice', 1] } }] } },
    // 6. Datos del usuario.
    { $lookup: { from: USUARIOS, localField: '_id', foreignField: '_id', pipeline: [{ $project: DATOS_USUARIO }], as: 'usuario' } },
    { $unwind: '$usuario' },
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
        // Valor denormalizado, para comparar.
        almacenamientoUsado: '$usuario.almacenamientoUsado',
      },
    },
    // $lookup no garantiza el orden.
    { $sort: { posicion: 1 } },
  ]);
}

// Recursos activos con al menos un permiso; se usa en carpetas y archivos.
function etapasRecursosCompartidos(tipo) {
  return [
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

// Reporte 5: usuarios con mas recursos compartidos. $unionWith junta
// carpetas y archivos (como UNION ALL).
export async function usuariosConMasCompartidos(consulta) {
  rechazarCamposDesconocidos(consulta, ['limite']);
  const limite = leerEntero(consulta.limite, 'limite', { minimo: 1, maximo: 100, defecto: 10 });

  return Carpeta.aggregate([
    // 1. Carpetas compartidas.
    ...etapasRecursosCompartidos('CARPETA'),
    // 2. Mas archivos compartidos.
    { $unionWith: { coll: ARCHIVOS, pipeline: etapasRecursosCompartidos('ARCHIVO') } },
    // 3. Agrupar por propietario.
    {
      $group: {
        _id: '$propietarioId',
        recursos: { $sum: 1 },
        carpetas: { $sum: { $cond: [{ $eq: ['$tipo', 'CARPETA'] }, 1, 0] } },
        archivos: { $sum: { $cond: [{ $eq: ['$tipo', 'ARCHIVO'] }, 1, 0] } },
        permisosOtorgados: { $sum: '$permisos' },
        destinatarios: { $push: '$destinatarios' },
      },
    },
    // 4. Destinatarios distintos.
    {
      $set: {
        usuariosDistintos: {
          $size: { $reduce: { input: '$destinatarios', initialValue: [], in: { $setUnion: ['$$value', '$$this'] } } },
        },
      },
    },
    // 5. Top N.
    { $sort: { recursos: -1, permisosOtorgados: -1 } },
    { $limit: limite },
    // 6. Datos del usuario.
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
