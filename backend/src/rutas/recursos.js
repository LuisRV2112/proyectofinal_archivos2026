import { Router } from 'express';
import { autenticar } from '../middleware/autenticacion.js';
import { cambiarNivel, compartir, listarPermisos, revocar } from '../servicios/comparticion.js';

// :tipo es archivos o carpetas; ambos usan el mismo compartidoCon.
const router = Router();

router.use(autenticar);

router.get('/:tipo/:id/compartir', async (req, res) => {
  res.json(await listarPermisos(req.params.tipo, req.params.id, req.usuario));
});

// Body: { usuarioId, nivel }. 201 si es nuevo; 200 si ya estaba y cambio el nivel.
router.post('/:tipo/:id/compartir', async (req, res) => {
  const resultado = await compartir(req.params.tipo, req.params.id, req.body, req.usuario);
  res.status(resultado.creado ? 201 : 200).json(resultado);
});

// Body: { nivel }
router.patch('/:tipo/:id/compartir/:usuarioId', async (req, res) => {
  res.json(await cambiarNivel(req.params.tipo, req.params.id, req.params.usuarioId, req.body, req.usuario));
});

router.delete('/:tipo/:id/compartir/:usuarioId', async (req, res) => {
  res.json(await revocar(req.params.tipo, req.params.id, req.params.usuarioId, req.usuario));
});

export default router;
