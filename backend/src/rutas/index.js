import { Router } from 'express';
import { obtenerSalud } from '../servicios/salud.js';
import rutasAutenticacion from './autenticacion.js';
import rutasUsuarios from './usuarios.js';
import rutasCarpetas from './carpetas.js';
import rutasArchivos from './archivos.js';
import rutasRecursos from './recursos.js';
import rutasCompartidos from './compartidos.js';
import rutasPapelera from './papelera.js';
import rutasReportes from './reportes.js';
import rutasActividad from './actividad.js';

const router = Router();

// Publica. 503 si MongoDB no responde.
router.get('/salud', async (_req, res) => {
  const salud = await obtenerSalud();
  res.status(salud.mongodb.responde ? 200 : 503).json(salud);
});

router.use('/auth', rutasAutenticacion);
router.use('/usuarios', rutasUsuarios);
router.use('/carpetas', rutasCarpetas);
router.use('/archivos', rutasArchivos);
router.use('/recursos', rutasRecursos);
router.use('/compartidos', rutasCompartidos);
router.use('/papelera', rutasPapelera);
router.use('/reportes', rutasReportes);
router.use('/actividad', rutasActividad);

export default router;
