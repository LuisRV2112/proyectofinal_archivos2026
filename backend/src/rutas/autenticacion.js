import { Router } from 'express';
import { autenticar } from '../middleware/autenticacion.js';
import { iniciarSesion, perfil } from '../servicios/autenticacion.js';

const router = Router();

// POST /api/auth/login → { token, expiraEn, id, username, nombreCompleto, email, rol }
router.post('/login', async (req, res) => {
  res.json(await iniciarSesion(req.body));
});

// GET /api/auth/yo → el usuario del token, con su almacenamiento usado
router.get('/yo', autenticar, (req, res) => {
  res.json({ ...perfil(req.usuario), almacenamientoUsado: req.usuario.almacenamientoUsado });
});

export default router;
