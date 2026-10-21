import { Router } from 'express';
import { autenticar } from '../middleware/autenticacion.js';
import { eliminarDefinitivamente, listarPapelera, restaurar } from '../servicios/papelera.js';

const router = Router();

router.use(autenticar);

router.get('/', async (req, res) => {
  res.json(await listarPapelera(req.usuario));
});

// :tipo = archivos | carpetas
router.post('/:tipo/:id/restaurar', async (req, res) => {
  res.json(await restaurar(req.params.tipo, req.params.id, req.usuario));
});

router.delete('/:tipo/:id', async (req, res) => {
  res.json(await eliminarDefinitivamente(req.params.tipo, req.params.id, req.usuario));
});

export default router;
