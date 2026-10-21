import { Router } from 'express';
import { pipeline } from 'node:stream/promises';
import { autenticar } from '../middleware/autenticacion.js';
import { recibirArchivo } from '../middleware/subida.js';
import {
  leerTexto,
  moverArchivo,
  obtenerArchivo,
  prepararDescarga,
  renombrarArchivo,
  subirArchivo,
} from '../servicios/archivos.js';
import { buscarArchivos } from '../servicios/busqueda.js';
import { enviarArchivoAPapelera } from '../servicios/papelera.js';

const router = Router();

router.use(autenticar);

// multipart/form-data: archivo (obligatorio), carpetaId y etiquetas (opcionales)
router.post('/', recibirArchivo, async (req, res) => {
  res.status(201).json(await subirArchivo(req.file, req.body, req.usuario));
});

// Antes de /:id, para que "buscar" no se tome como un id.
router.get('/buscar', async (req, res) => {
  res.json(await buscarArchivos(req.query, req.usuario));
});

router.get('/:id', async (req, res) => {
  res.json(await obtenerArchivo(req.params.id, req.usuario));
});

router.get('/:id/descargar', async (req, res) => {
  const { archivo, flujo } = await prepararDescarga(req.params.id, req.usuario);
  // attachment = el navegador lo guarda en vez de mostrarlo. res.attachment
  // codifica el nombre (filename*=UTF-8''...) para que las tildes lleguen bien.
  // Va antes de res.type porque tambien fija un Content-Type (sin charset).
  res.attachment(archivo.nombre);
  res.type(`${archivo.mimeType}; charset=utf-8`);
  res.set('Content-Length', String(archivo.tamano));
  // Si el stream falla a medias ya no se puede enviar un error JSON (las
  // cabeceras salieron); pipeline corta la conexion y el cliente ve la
  // descarga incompleta.
  await pipeline(flujo, res).catch((error) => console.error(`[descarga] ${archivo._id}: ${error.message}`));
});

// inline = para mostrarlo dentro de la aplicacion (vista previa)
router.get('/:id/contenido', async (req, res) => {
  const { texto } = await leerTexto(req.params.id, req.usuario);
  res.type('text/plain; charset=utf-8').set('Content-Disposition', 'inline').send(texto);
});

// Body: { nombre } — misma extension
router.patch('/:id', async (req, res) => {
  res.json(await renombrarArchivo(req.params.id, req.body, req.usuario));
});

// Body: { carpetaId } — null para mover a la raiz
router.patch('/:id/mover', async (req, res) => {
  res.json(await moverArchivo(req.params.id, req.body, req.usuario));
});

// A la papelera (no borra; ver servicios/papelera.js)
router.delete('/:id', async (req, res) => {
  res.json(await enviarArchivoAPapelera(req.params.id, req.usuario));
});

export default router;
