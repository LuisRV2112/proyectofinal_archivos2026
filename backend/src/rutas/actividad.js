import { Router } from 'express';
import { autenticar } from '../middleware/autenticacion.js';
import { listarActividad } from '../servicios/actividad.js';

// El servicio limita al usuario normal a su propio historial.
const router = Router();

router.use(autenticar);

router.get('/', async (req, res) => {
  res.json(await listarActividad(req.query, req.usuario));
});

export default router;
