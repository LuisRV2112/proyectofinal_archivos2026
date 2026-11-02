import { Router } from 'express';
import { autenticar, exigirRol } from '../middleware/autenticacion.js';
import {
  archivosConMasOperaciones,
  archivosPorFecha,
  archivosPorTipo,
  carpetasConMasArchivos,
} from '../servicios/reportes/archivos.js';
import { topUsuariosPorArchivos, usuariosConMasCompartidos } from '../servicios/reportes/usuarios.js';
import {
  archivosNuncaCompartidos,
  compartidosPorUsuario,
  recibidosPorUsuario,
  recursosConMasUsuarios,
} from '../servicios/reportes/comparticion.js';
import {
  historialUsuario,
  operacionesPorPeriodo,
  operacionesPorTipo,
  principalesAcciones,
} from '../servicios/reportes/actividad.js';

// Archivos, usuarios y actividad global: solo administrador.
// Comparticion e historial: cualquiera, pero el usuario solo ve lo suyo.
const router = Router();
const soloAdmin = exigirRol('ADMINISTRADOR');

router.use(autenticar);

// Archivos
router.get('/archivos/por-tipo', soloAdmin, async (req, res) => {
  res.json(await archivosPorTipo(req.query));
});
router.get('/archivos/por-fecha', soloAdmin, async (req, res) => {
  res.json(await archivosPorFecha(req.query));
});
router.get('/archivos/mas-operaciones', soloAdmin, async (req, res) => {
  res.json(await archivosConMasOperaciones(req.query));
});
router.get('/archivos/carpetas-mas-archivos', soloAdmin, async (req, res) => {
  res.json(await carpetasConMasArchivos(req.query));
});

// Usuarios
router.get('/usuarios/top-archivos', soloAdmin, async (req, res) => {
  res.json(await topUsuariosPorArchivos(req.query));
});
router.get('/usuarios/mas-compartidos', soloAdmin, async (req, res) => {
  res.json(await usuariosConMasCompartidos(req.query));
});

// Comparticion
router.get('/comparticion/mas-compartidos', async (req, res) => {
  res.json(await recursosConMasUsuarios(req.query, req.usuario));
});
router.get('/comparticion/compartidos-por', async (req, res) => {
  res.json(await compartidosPorUsuario(req.query, req.usuario));
});
router.get('/comparticion/recibidos', async (req, res) => {
  res.json(await recibidosPorUsuario(req.query, req.usuario));
});
router.get('/comparticion/nunca-compartidos', async (req, res) => {
  res.json(await archivosNuncaCompartidos(req.query, req.usuario));
});

// Actividad
router.get('/actividad/historial', async (req, res) => {
  res.json(await historialUsuario(req.query, req.usuario));
});
router.get('/actividad/por-tipo', soloAdmin, async (req, res) => {
  res.json(await operacionesPorTipo(req.query));
});
router.get('/actividad/por-periodo', soloAdmin, async (req, res) => {
  res.json(await operacionesPorPeriodo(req.query));
});
router.get('/actividad/principales', soloAdmin, async (req, res) => {
  res.json(await principalesAcciones(req.query));
});

export default router;
