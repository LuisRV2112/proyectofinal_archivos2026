import { Router } from 'express';
import { obtenerSalud } from '../servicios/salud.js';
import rutasAutenticacion from './autenticacion.js';
import rutasUsuarios from './usuarios.js';
import rutasCarpetas from './carpetas.js';
import rutasArchivos from './archivos.js';

/** Todas las rutas de la API; app.js las monta bajo /api. */
const router = Router();

// Publica: la usan el frontend y los scripts para saber si la API esta lista.
// 503 si MongoDB no responde, para que un monitor lo detecte por el codigo.
router.get('/salud', async (_req, res) => {
  const salud = await obtenerSalud();
  res.status(salud.mongodb.responde ? 200 : 503).json(salud);
});

router.use('/auth', rutasAutenticacion);
router.use('/usuarios', rutasUsuarios);
router.use('/carpetas', rutasCarpetas);
router.use('/archivos', rutasArchivos);

export default router;
