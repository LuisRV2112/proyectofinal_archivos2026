import { Router } from 'express';
import { autenticar } from '../middleware/autenticacion.js';
import {
  crearCarpeta,
  listarRaiz,
  moverCarpeta,
  obtenerCarpeta,
  renombrarCarpeta,
} from '../servicios/carpetas.js';
import { enviarCarpetaAPapelera } from '../servicios/papelera.js';

const router = Router();

router.use(autenticar);

// Va antes de /:id para que "raiz" no se interprete como un id.
router.get('/raiz', async (req, res) => {
  res.json(await listarRaiz(req.usuario, req.query));
});

router.get('/:id', async (req, res) => {
  res.json(await obtenerCarpeta(req.params.id, req.usuario));
});

// Body: { nombre, padreId? }
router.post('/', async (req, res) => {
  res.status(201).json(await crearCarpeta(req.body, req.usuario));
});

// Body: { nombre }
router.patch('/:id', async (req, res) => {
  res.json(await renombrarCarpeta(req.params.id, req.body, req.usuario));
});

// Body: { padreId } — null para mover a la raiz
router.patch('/:id/mover', async (req, res) => {
  res.json(await moverCarpeta(req.params.id, req.body, req.usuario));
});

// A la papelera junto con todo su subarbol
router.delete('/:id', async (req, res) => {
  res.json(await enviarCarpetaAPapelera(req.params.id, req.usuario));
});

export default router;
