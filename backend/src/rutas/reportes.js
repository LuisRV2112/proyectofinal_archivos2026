import { Router } from 'express';
import { autenticar, exigirRol } from '../middleware/autenticacion.js';
import { archivosConMasOperaciones, archivosPorFecha, archivosPorTipo } from '../servicios/reportes/archivos.js';
import { topUsuariosPorArchivos, usuariosConMasCompartidos } from '../servicios/reportes/usuarios.js';
import {
  compartidosPorUsuario,
  recibidosPorUsuario,
  recursosConMasUsuarios,
} from '../servicios/reportes/comparticion.js';

/**
 * Reportes (seccion 7 del modelo). Los de archivos y usuarios son solo del
 * administrador (seccion 6). Los de comparticion los usa cualquiera, pero un
 * usuario normal solo ve los propios (el servicio lo restringe).
 */
const router = Router();
const soloAdmin = exigirRol('ADMINISTRADOR');

router.use(autenticar);

// --- Archivos y almacenamiento ---
router.get('/archivos/por-tipo', soloAdmin, async (req, res) => {
  res.json(await archivosPorTipo(req.query));
});
router.get('/archivos/por-fecha', soloAdmin, async (req, res) => {
  res.json(await archivosPorFecha(req.query));
});
router.get('/archivos/mas-operaciones', soloAdmin, async (req, res) => {
  res.json(await archivosConMasOperaciones(req.query));
});

// --- Usuarios ---
router.get('/usuarios/top-archivos', soloAdmin, async (req, res) => {
  res.json(await topUsuariosPorArchivos(req.query));
});
router.get('/usuarios/mas-compartidos', soloAdmin, async (req, res) => {
  res.json(await usuariosConMasCompartidos(req.query));
});

// --- Comparticion (admin: todos; usuario: los propios) ---
router.get('/comparticion/mas-compartidos', async (req, res) => {
  res.json(await recursosConMasUsuarios(req.query, req.usuario));
});
router.get('/comparticion/compartidos-por', async (req, res) => {
  res.json(await compartidosPorUsuario(req.query, req.usuario));
});
router.get('/comparticion/recibidos', async (req, res) => {
  res.json(await recibidosPorUsuario(req.query, req.usuario));
});

export default router;
