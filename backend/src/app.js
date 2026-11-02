import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { conectarBaseDatos, desconectarBaseDatos } from './config/baseDatos.js';
import { manejarErrores, rutaNoEncontrada } from './middleware/errores.js';
import rutas from './rutas/index.js';

const PUERTO = Number(process.env.PORT) || 3000;

// Unico origen que el navegador deja llamar a la API.
const ORIGEN_FRONTEND = process.env.ORIGEN_FRONTEND || 'http://localhost:4200';

export function crearApp() {
  const app = express();

  app.use(cors({ origin: ORIGEN_FRONTEND }));
  // Los archivos llegan por multer, aqui solo JSON pequeno.
  app.use(express.json({ limit: '100kb' }));

  app.use('/api', rutas);

  // Al final: primero el 404 y luego el manejador de errores.
  app.use(rutaNoEncontrada);
  app.use(manejarErrores);
  return app;
}

// Escucha solo despues de conectar a MongoDB.
async function iniciar() {
  try {
    const conexion = await conectarBaseDatos();
    console.log(`MongoDB conectado: ${conexion.name}`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }

  const servidor = crearApp().listen(PUERTO, () => {
    console.log(`API escuchando en http://localhost:${PUERTO}/api`);
  });

  // Ctrl+C o reinicio de nodemon: cerrar servidor y conexion.
  const cerrar = async () => {
    servidor.close();
    await desconectarBaseDatos();
    process.exit(0);
  };
  process.on('SIGINT', cerrar);
  process.on('SIGTERM', cerrar);
}

iniciar();
