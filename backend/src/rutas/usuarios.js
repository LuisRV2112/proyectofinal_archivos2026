import { Router } from 'express';
import { autenticar, exigirRol } from '../middleware/autenticacion.js';
import { actualizarUsuario, cambiarEstadoUsuario, crearUsuario, listarUsuarios } from '../servicios/usuarios.js';

const router = Router();

// Toda la gestion de usuarios es exclusiva del administrador (seccion 6).
router.use(autenticar, exigirRol('ADMINISTRADOR'));

router.get('/', async (req, res) => {
  res.json(await listarUsuarios(req.query));
});

router.post('/', async (req, res) => {
  res.status(201).json(await crearUsuario(req.body, req.usuario));
});

router.patch('/:id', async (req, res) => {
  res.json(await actualizarUsuario(req.params.id, req.body, req.usuario));
});

// Body: { "activo": true | false }
router.patch('/:id/estado', async (req, res) => {
  res.json(await cambiarEstadoUsuario(req.params.id, req.body, req.usuario));
});

export default router;
