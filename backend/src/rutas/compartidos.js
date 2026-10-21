import { Router } from 'express';
import { autenticar } from '../middleware/autenticacion.js';
import { compartidoConmigo, compartidoPorMi, listarDestinatarios } from '../servicios/comparticion.js';

const router = Router();

router.use(autenticar);

router.get('/conmigo', async (req, res) => {
  res.json(await compartidoConmigo(req.usuario));
});

router.get('/por-mi', async (req, res) => {
  res.json(await compartidoPorMi(req.usuario));
});

// Para el selector de "compartir con..." del frontend.
router.get('/usuarios', async (req, res) => {
  res.json(await listarDestinatarios(req.usuario));
});

export default router;
