import { Router } from 'express';
import { autenticar } from '../middleware/autenticacion.js';
import { listarActividad } from '../servicios/actividad.js';

/**
 * Historial de actividad. Abierto a cualquier usuario autenticado: el
 * servicio limita a un usuario normal a su propio historial (seccion 6).
 */
const router = Router();

router.use(autenticar);

router.get('/', async (req, res) => {
  res.json(await listarActividad(req.query, req.usuario));
});

export default router;
