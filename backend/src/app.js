import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { conectarBaseDatos, desconectarBaseDatos } from './config/baseDatos.js';
import { manejarErrores, rutaNoEncontrada } from './middleware/errores.js';
import rutas from './rutas/index.js';

const PUERTO = Number(process.env.PORT) || 3000;

// Origen del frontend Angular. Solo ese origen puede llamar a la API desde
// un navegador; configurable por si el frontend corre en otro puerto.
const ORIGEN_FRONTEND = process.env.ORIGEN_FRONTEND || 'http://localhost:4200';

export function crearApp() {
  const app = express();

  app.use(cors({ origin: ORIGEN_FRONTEND }));
  // Limite bajo para JSON: aqui solo llegan datos pequenos (login, nombres,
  // permisos). El contenido de los archivos llega como multipart por multer,
  // que tiene su propio limite, asi que no pasa por este parser.
  app.use(express.json({ limit: '100kb' }));

  app.use('/api', rutas);

  // Orden obligatorio: el 404 despues de todas las rutas y el manejador de
  // errores al final de todo.
  app.use(rutaNoEncontrada);
  app.use(manejarErrores);
  return app;
}

/**
 * El servidor empieza a escuchar solo despues de conectar a MongoDB: si
 * aceptara peticiones antes, las primeras fallarian sin motivo aparente. Si
 * la conexion falla, el proceso termina con un mensaje claro.
 */
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

  // Cierre ordenado (Ctrl+C, o nodemon al reiniciar): deja de aceptar
  // conexiones y cierra la de MongoDB.
  const cerrar = async () => {
    servidor.close();
    await desconectarBaseDatos();
    process.exit(0);
  };
  process.on('SIGINT', cerrar);
  process.on('SIGTERM', cerrar);
}

iniciar();
