/**
 * Verificacion de la carga inicial: `npm run seed:verificar`.
 *
 * Comprueba, contra lo que de verdad quedo en MongoDB, cada regla de
 * consistencia de la seccion 8 del modelo. No confia en el seed: recalcula
 * todo desde la base. Termina con codigo de salida 1 si algo falla.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { conectarBaseDatos, desconectarBaseDatos } from '../config/baseDatos.js';
import { leerContenido, NOMBRE_BUCKET } from '../config/gridfs.js';
import { Usuario, Carpeta, Archivo, Actividad } from '../modelos/index.js';
import { ARCHIVOS } from './datos.js';

let fallos = 0;
function comprobar(descripcion, problemas) {
  const lista = Array.isArray(problemas) ? problemas : problemas ? [problemas] : [];
  console.log(`${lista.length ? 'FALLA' : '  ok '}  ${descripcion}`);
  for (const p of lista.slice(0, 5)) console.log(`         - ${p}`);
  fallos += lista.length ? 1 : 0;
}

const iguales = (a, b) => a.length === b.length && a.every((id, i) => id.equals(b[i]));

async function principal() {
  await conectarBaseDatos();
  const db = mongoose.connection.db;

  const [usuarios, carpetas, archivos, actividad, contenidos] = await Promise.all([
    Usuario.find().lean(),
    Carpeta.find().lean(),
    Archivo.find().lean(),
    Actividad.find().sort({ fecha: 1 }).lean(),
    db.collection(`${NOMBRE_BUCKET}.files`).find().toArray(),
  ]);
  const carpetaPorId = new Map(carpetas.map((c) => [String(c._id), c]));
  const contenidoPorId = new Map(contenidos.map((g) => [String(g._id), g]));

  console.log('Conteos');
  comprobar('4 usuarios, 1 de ellos ADMINISTRADOR', usuarios.length !== 4 || usuarios.filter((u) => u.rol === 'ADMINISTRADOR').length !== 1 ? `hay ${usuarios.length}` : null);
  comprobar('50 archivos y 50 documentos en contenido.files', archivos.length !== 50 || contenidos.length !== 50 ? `${archivos.length} archivos, ${contenidos.length} en GridFS` : null);
  comprobar('Ambos tipos de archivo presentes', ['txt', 'md'].filter((e) => !archivos.some((a) => a.extension === e)).map((e) => `falta .${e}`));
  const permisos = [...carpetas, ...archivos].flatMap((d) => d.compartidoCon);
  comprobar(`Al menos 20 comparticiones (hay ${permisos.length})`, permisos.length < 20 ? 'insuficientes' : null);
  comprobar('Se usan los tres niveles de permiso', ['LECTURA', 'COMENTARIO', 'EDICION'].filter((n) => !permisos.some((p) => p.nivel === n)));

  console.log('\nContenido en GridFS');
  comprobar('Cada archivo apunta a un contenido que existe', archivos.filter((a) => !contenidoPorId.has(String(a.gridfsId))).map((a) => a.nombre));
  comprobar('`tamano` coincide con `length` de GridFS', archivos.filter((a) => contenidoPorId.get(String(a.gridfsId))?.length !== a.tamano).map((a) => a.nombre));
  comprobar('No hay contenidos huerfanos en GridFS', contenidos.filter((g) => !archivos.some((a) => a.gridfsId.equals(g._id))).map((g) => g.filename));
  comprobar('El filename de GridFS es el nombre actual del archivo', archivos.filter((a) => contenidoPorId.get(String(a.gridfsId))?.filename !== a.nombre).map((a) => a.nombre));

  // Descarga real desde GridFS y comparacion byte a byte con el texto original.
  const especificaciones = new Map(ARCHIVOS.map((a) => [a.nombre, a]));
  const distintos = [];
  let bytesMultibyte = 0;
  for (const a of archivos) {
    const descargado = await leerContenido(a.gridfsId);
    const original = Buffer.from(especificaciones.get(a.nombre).contenido(), 'utf8');
    if (!descargado.equals(original)) distintos.push(a.nombre);
    bytesMultibyte += descargado.length - descargado.toString('utf8').length;
  }
  comprobar('El contenido descargado de GridFS es identico al original (50 de 50)', distintos);
  comprobar(`\`tamano\` cuenta bytes, no caracteres (${bytesMultibyte} bytes extra por tildes y enes)`, bytesMultibyte === 0 ? 'no hay caracteres multibyte para probarlo' : null);

  console.log('\nJerarquia (Array of Ancestors)');
  const errCarpetas = [];
  for (const c of carpetas) {
    const padre = c.padreId ? carpetaPorId.get(String(c.padreId)) : null;
    if (c.padreId && !padre) { errCarpetas.push(`${c.ruta}: padre inexistente`); continue; }
    const esperados = padre ? [...padre.ancestros, padre._id] : [];
    if (!iguales(c.ancestros, esperados)) errCarpetas.push(`${c.ruta}: ancestros incorrectos`);
    const rutaEsperada = padre ? `${padre.ruta}/${c.nombre}` : `/${c.nombre}`;
    if (c.ruta !== rutaEsperada) errCarpetas.push(`${c.ruta}: deberia ser ${rutaEsperada}`);
    if (!padre?.propietarioId.equals(c.propietarioId) && padre) errCarpetas.push(`${c.ruta}: propietario distinto al del padre`);
  }
  comprobar('`ancestros` y `ruta` de cada carpeta cuadran con su `padreId`', errCarpetas);
  const profundidad = Math.max(...carpetas.map((c) => c.ancestros.length + 1));
  comprobar(`Al menos 3 niveles de profundidad (maximo: ${profundidad})`, profundidad < 3 ? 'poco profundo' : null);

  const errArchivos = [];
  for (const a of archivos) {
    const c = a.carpetaId ? carpetaPorId.get(String(a.carpetaId)) : null;
    if (a.carpetaId && !c) { errArchivos.push(`${a.nombre}: carpeta inexistente`); continue; }
    if (!iguales(a.ancestros, c ? [...c.ancestros, c._id] : [])) errArchivos.push(`${a.nombre}: ancestros incorrectos`);
  }
  comprobar('`ancestros` de cada archivo = ancestros de su carpeta + la carpeta', errArchivos);

  const hermanos = new Map();
  for (const d of [...carpetas.map((c) => ['C', c.padreId, c]), ...archivos.map((a) => ['A', a.carpetaId, a])]) {
    const [tipo, padreId, doc] = d;
    if (doc.eliminado.estado) continue;
    const clave = `${tipo}|${doc.propietarioId}|${padreId}|${doc.nombre.toLowerCase()}`;
    hermanos.set(clave, (hermanos.get(clave) ?? 0) + 1);
  }
  comprobar('No hay dos hermanos con el mismo nombre', [...hermanos].filter(([, n]) => n > 1).map(([k]) => k));

  console.log('\nPapelera');
  const errPapelera = [];
  for (const c of carpetas.filter((x) => x.eliminado.estado)) {
    const enSubarbol = [...carpetas, ...archivos].filter((d) => d.ancestros.some((id) => id.equals(c._id)));
    for (const d of enSubarbol.filter((x) => !x.eliminado.estado)) errPapelera.push(`${d.nombre} esta dentro de ${c.ruta} pero no en la papelera`);
  }
  comprobar('Toda carpeta en papelera tiene su subarbol en papelera', errPapelera);
  const sinDatos = [...carpetas, ...archivos].filter((d) => d.eliminado.estado && (!d.eliminado.fecha || !d.eliminado.eliminadoPor));
  comprobar('Lo eliminado registra fecha y autor', sinDatos.map((d) => d.nombre));
  const archivosPapelera = archivos.filter((a) => a.eliminado.estado);
  const carpetasPapelera = carpetas.filter((c) => c.eliminado.estado);
  const raices = carpetasPapelera.filter((c) => !carpetasPapelera.some((p) => p._id.equals(c.padreId)));
  const sueltos = archivosPapelera.filter((a) => !carpetasPapelera.some((c) => c._id.equals(a.carpetaId)));
  console.log(`         (${sueltos.length} archivos eliminados por separado + ${raices.length} carpeta eliminada con ${carpetasPapelera.length - raices.length} subcarpeta(s) y ${archivosPapelera.length - sueltos.length} archivo(s) en cascada)`);
  comprobar('4 archivos eliminados por separado y 1 carpeta con su subarbol', sueltos.length !== 4 || raices.length !== 1 ? 'no coincide con lo propuesto' : null);

  console.log('\nAlmacenamiento');
  const errAlm = usuarios
    .map((u) => [u, archivos.filter((a) => a.propietarioId.equals(u._id)).reduce((s, a) => s + a.tamano, 0)])
    .filter(([u, suma]) => u.almacenamientoUsado !== suma)
    .map(([u, suma]) => `${u.username}: guardado ${u.almacenamientoUsado}, suma real ${suma}`);
  comprobar('`almacenamientoUsado` = suma de sus archivos (papelera incluida)', errAlm);

  console.log('\nPermisos');
  const errPermisos = [];
  for (const d of [...carpetas, ...archivos]) {
    const vistos = new Set();
    for (const p of d.compartidoCon) {
      if (p.usuarioId.equals(d.propietarioId)) errPermisos.push(`${d.nombre}: compartido con su propio propietario`);
      if (vistos.has(String(p.usuarioId))) errPermisos.push(`${d.nombre}: usuario repetido`);
      if (!p.otorgadoPor.equals(d.propietarioId)) errPermisos.push(`${d.nombre}: lo otorgo alguien que no es el propietario`);
      vistos.add(String(p.usuarioId));
    }
  }
  comprobar('Sin permisos al propietario ni usuarios repetidos', errPermisos);
  comprobar('Ningun usuario tiene passwordHash en texto plano', (await Usuario.find().select('+passwordHash').lean()).filter((u) => !/^\$2[aby]\$/.test(u.passwordHash)).map((u) => u.username));

  console.log('\nHistorial');
  const idsExistentes = new Set([...usuarios, ...carpetas, ...archivos].map((d) => String(d._id)));
  const huerfanas = actividad.filter((e) => !idsExistentes.has(String(e.recursoId)));
  comprobar(
    'Solo apuntan a recursos inexistentes las entradas de algo eliminado definitivamente',
    huerfanas.filter((e) => !actividad.some((x) => x.accion === 'ELIMINAR_DEFINITIVO' && x.recursoId.equals(e.recursoId))).map((e) => `${e.accion} ${e.recursoNombre}`)
  );
  console.log(`         (${huerfanas.length} entradas de "${huerfanas[0]?.recursoNombre}" siguen legibles gracias a recursoNombre)`);

  const errOrden = [];
  for (const d of [...carpetas, ...archivos]) {
    const entradas = actividad.filter((e) => e.recursoId.equals(d._id));
    const creacion = entradas.find((e) => e.accion === 'CREAR_CARPETA' || e.accion === 'SUBIR');
    if (!creacion) { errOrden.push(`${d.nombre}: sin entrada de creacion`); continue; }
    if (entradas[0] !== creacion) errOrden.push(`${d.nombre}: tiene operaciones antes de crearse`);
    if (creacion.fecha.getTime() !== d.creadoEn.getTime()) errOrden.push(`${d.nombre}: creadoEn no coincide con su entrada`);
  }
  for (const u of usuarios) {
    const primera = actividad.find((e) => e.usuarioId.equals(u._id));
    if (primera && primera.fecha < u.creadoEn) errOrden.push(`${u.username} actua antes de ser creado`);
    const primeraAccion = actividad.find((e) => e.usuarioId.equals(u._id) && e.accion !== 'LOGIN');
    if (primera && primera.accion !== 'LOGIN') errOrden.push(`${u.username}: su primera entrada no es un LOGIN`);
    if (primeraAccion && primeraAccion.fecha < primera.fecha) errOrden.push(`${u.username}: actua antes de iniciar sesion`);
  }
  comprobar('Orden cronologico: nada ocurre antes de que exista el recurso o el usuario', errOrden);
  const porAccion = Object.entries(actividad.reduce((m, e) => ({ ...m, [e.accion]: (m[e.accion] ?? 0) + 1 }), {}));
  console.log(`         ${actividad.length} entradas: ${porAccion.map(([a, n]) => `${a} ${n}`).join(', ')}`);
  const meses = [...new Set(actividad.map((e) => e.fecha.toISOString().slice(0, 7)))];
  console.log(`         de ${actividad[0].fecha.toISOString().slice(0, 10)} a ${actividad.at(-1).fecha.toISOString().slice(0, 10)} (${meses.length} meses)`);

  console.log('\nIndices');
  const esperados = {
    usuarios: ['username_1', 'email_1'],
    carpetas: ['propietarioId_1_padreId_1', 'ancestros_1', 'compartidoCon.usuarioId_1', 'eliminado.estado_1'],
    archivos: ['propietarioId_1_carpetaId_1', 'ancestros_1', 'compartidoCon.usuarioId_1', 'eliminado.estado_1', 'busqueda_texto', 'extension_1', 'creadoEn_-1'],
    actividad: ['usuarioId_1_fecha_-1', 'accion_1', 'fecha_-1'],
  };
  for (const [coleccion, nombres] of Object.entries(esperados)) {
    const existentes = (await db.collection(coleccion).indexes()).map((i) => i.name);
    comprobar(`${coleccion}: ${nombres.length} indices de la tabla 4.4`, nombres.filter((n) => !existentes.includes(n)).map((n) => `falta ${n}`));
  }
  const unicos = (await db.collection('usuarios').indexes()).filter((i) => i.unique).map((i) => i.name);
  comprobar('username y email son unicos', ['username_1', 'email_1'].filter((n) => !unicos.includes(n)));

  console.log(`\n${fallos ? `${fallos} comprobacion(es) fallaron` : 'Todas las comprobaciones pasaron'}`);
  process.exitCode = fallos ? 1 : 0;
}

try {
  await principal();
} catch (error) {
  console.error(`ERROR: ${error.message}`);
  process.exitCode = 1;
} finally {
  await desconectarBaseDatos();
}
