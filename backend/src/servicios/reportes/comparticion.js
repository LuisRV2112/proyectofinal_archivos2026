import { Actividad, Archivo, Carpeta, EXTENSIONES_PERMITIDAS, Usuario } from '../../modelos/index.js';
import { ErrorValidacion } from '../../utilidades/errores.js';
import { etapasPaginacion, leerEntero, leerPaginacion, respuestaPaginada } from '../../utilidades/consultas.js';
import { rechazarCamposDesconocidos } from '../../utilidades/validacion.js';
import { COLACION_NOMBRES } from '../arbol.js';
import { etapasPropietario } from './archivos.js';
import { leerUsuarioObjetivo } from './comun.js';

// Reportes de comparticion (6, 7, 8 y 13). El usuario solo ve los suyos.
// Empiezan en carpetas y $unionWith agrega los archivos; ambos tienen el
// mismo compartidoCon.

const USUARIOS = Usuario.collection.name;
const CARPETAS = Carpeta.collection.name;
const ARCHIVOS = Archivo.collection.name;
const TIPOS = ['CARPETA', 'ARCHIVO'];

const PROHIBIDO = 'Solo puedes consultar tus propios reportes de compartición';

function leerTipo(valor) {
  if (valor === undefined) return null;
  const tipo = String(valor).toUpperCase();
  if (!TIPOS.includes(tipo)) throw new ErrorValidacion(`Tipo no válido: ${valor}`, 'Usa CARPETA o ARCHIVO');
  return tipo;
}

// Filtra, marca el tipo y calcula la ubicacion.
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

// Si se pidio un solo tipo, la otra coleccion recibe un $match que no coincide.
function etapasUnion(filtro, tipo) {
  const filtroCarpetas = tipo === 'ARCHIVO' ? { _id: null } : filtro;
  const filtroArchivos = tipo === 'CARPETA' ? { _id: null } : filtro;
  return [
    ...etapasRecurso('CARPETA', filtroCarpetas),
    { $unionWith: { coll: ARCHIVOS, pipeline: etapasRecurso('ARCHIVO', filtroArchivos) } },
  ];
}

// usuarioId de cada permiso -> { username, nombreCompleto }
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

// Reporte 6: recursos compartidos con mas usuarios.
export async function recursosConMasUsuarios(consulta, usuario) {
  rechazarCamposDesconocidos(consulta, ['tipo', 'limite']);
  const tipo = leerTipo(consulta.tipo);
  const limite = leerEntero(consulta.limite, 'limite', { minimo: 1, maximo: 100, defecto: 10 });
  const filtro = {
    'compartidoCon.0': { $exists: true },
    ...(usuario.rol !== 'ADMINISTRADOR' && { propietarioId: usuario._id }),
  };

  return Carpeta.aggregate([
    // 1. Carpetas y archivos compartidos.
    ...etapasUnion(filtro, tipo),
    // 2. Tamano del array embebido, sin otra consulta.
    { $set: { usuarios: { $size: '$compartidoCon' } } },
    // 3. Top N.
    { $sort: { usuarios: -1, nombre: 1 } },
    { $limit: limite },
    // 4. Nombres de propietario y destinatarios.
    ...etapasPropietario(),
    ...etapasDestinatarios(),
    { $project: { propietarioId: 0 } },
    // Para ordenar por nombre sin importar mayusculas.
  ]).collation(COLACION_NOMBRES);
}

// Reporte 7: recursos compartidos por un usuario.
export async function compartidosPorUsuario(consulta, usuario) {
  rechazarCamposDesconocidos(consulta, ['usuarioId', 'tipo', 'pagina', 'limite']);
  const objetivo = await leerUsuarioObjetivo(consulta, usuario, PROHIBIDO);
  const tipo = leerTipo(consulta.tipo);
  const paginacion = leerPaginacion(consulta);

  const resultado = await Carpeta.aggregate([
    // 1. Recursos del usuario con algun permiso.
    ...etapasUnion({ propietarioId: objetivo._id, 'compartidoCon.0': { $exists: true } }, tipo),
    // 2. Cantidad de usuarios.
    { $set: { usuarios: { $size: '$compartidoCon' } } },
    // 3. Ordenar.
    { $sort: { usuarios: -1, nombre: 1 } },
    // 4. Paginar y luego traer los destinatarios.
    ...etapasPaginacion(paginacion, [...etapasDestinatarios(), { $project: { propietarioId: 0 } }]),
  ]).collation(COLACION_NOMBRES);

  return { usuario: objetivo, ...respuestaPaginada(resultado, paginacion) };
}

// Reporte 8: recursos recibidos por un usuario. Solo los directos; lo
// heredado se deduce de la carpeta.
export async function recibidosPorUsuario(consulta, usuario) {
  rechazarCamposDesconocidos(consulta, ['usuarioId', 'tipo', 'pagina', 'limite']);
  const objetivo = await leerUsuarioObjetivo(consulta, usuario, PROHIBIDO);
  const tipo = leerTipo(consulta.tipo);
  const paginacion = leerPaginacion(consulta);

  const resultado = await Carpeta.aggregate([
    // 1. Donde aparece en compartidoCon (indice multiclave).
    ...etapasUnion({ 'compartidoCon.usuarioId': objetivo._id }, tipo),
    // 2. Solo su permiso.
    {
      $set: {
        permiso: { $first: { $filter: { input: '$compartidoCon', cond: { $eq: ['$$this.usuarioId', objetivo._id] } } } },
      },
    },
    { $set: { nivel: '$permiso.nivel', recibidoEn: '$permiso.otorgadoEn', otorgadoPor: '$permiso.otorgadoPor' } },
    // 3. Mas recientes primero.
    { $sort: { recibidoEn: -1 } },
    // 4. Paginar con propietario y quien lo otorgo.
    ...etapasPaginacion(paginacion, [
      ...etapasPropietario(),
      ...etapasPropietario('otorgadoPor', 'otorgadoPor'),
      { $project: { compartidoCon: 0, permiso: 0, propietarioId: 0 } },
    ]),
  ]);

  return { usuario: objetivo, ...respuestaPaginada(resultado, paginacion) };
}

// Reporte 13: archivos nunca compartidos.
// Se revisa el historial y no compartidoCon, porque un permiso revocado
// tambien cuenta. Tambien cuenta si se compartio una carpeta ancestro.
export async function archivosNuncaCompartidos(consulta, usuario) {
  rechazarCamposDesconocidos(consulta, ['usuarioId', 'extension', 'pagina', 'limite']);
  const paginacion = leerPaginacion(consulta, { defecto: 20, maximo: 100 });
  const filtro = { 'eliminado.estado': false };
  if (usuario.rol !== 'ADMINISTRADOR' || consulta.usuarioId !== undefined) {
    filtro.propietarioId = (await leerUsuarioObjetivo(consulta, usuario, PROHIBIDO))._id;
  }
  if (consulta.extension !== undefined) {
    const extension = String(consulta.extension).toLowerCase().replace(/^\./, '');
    if (!EXTENSIONES_PERMITIDAS.includes(extension)) {
      throw new ErrorValidacion(`Extensión no válida: ${consulta.extension}`, `Valores aceptados: ${EXTENSIONES_PERMITIDAS.join(', ')}`);
    }
    filtro.extension = extension;
  }

  const [resultado] = await Archivo.aggregate([
    // 1. Sin permisos vigentes.
    { $match: { ...filtro, 'compartidoCon.0': { $exists: false } } },
    // 2. Buscar un COMPARTIR del archivo o de sus ancestros; basta uno.
    {
      $lookup: {
        from: Actividad.collection.name,
        let: { ids: { $concatArrays: [['$_id'], '$ancestros'] } },
        pipeline: [
          { $match: { accion: 'COMPARTIR', $expr: { $in: ['$recursoId', '$$ids'] } } },
          { $limit: 1 },
          { $project: { _id: 1 } },
        ],
        as: 'comparticiones',
      },
    },
    // 3. Los que no tienen ninguno.
    { $match: { comparticiones: { $size: 0 } } },
    // 4. Mas antiguos primero.
    { $sort: { creadoEn: 1, _id: 1 } },
    // 5. Paginar con ruta y propietario.
    ...etapasPaginacion(paginacion, [
      { $lookup: { from: CARPETAS, localField: 'carpetaId', foreignField: '_id', pipeline: [{ $project: { ruta: 1 } }], as: 'carpeta' } },
      ...etapasPropietario(),
      {
        $project: {
          nombre: 1,
          extension: 1,
          tamano: 1,
          creadoEn: 1,
          propietario: 1,
          ubicacion: { $ifNull: [{ $first: '$carpeta.ruta' }, '/'] },
        },
      },
    ]),
  ]);
  return respuestaPaginada([resultado], paginacion);
}
