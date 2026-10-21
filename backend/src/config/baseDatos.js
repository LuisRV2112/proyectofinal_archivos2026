import mongoose from 'mongoose';

/**
 * Conecta Mongoose a MongoDB usando MONGODB_URI del .env.
 *
 * serverSelectionTimeoutMS en 5 s: si mongod no esta corriendo, el arranque
 * falla rapido con un mensaje claro en vez de quedarse colgado 30 s (el valor
 * por defecto del driver) sin decir nada.
 */
export async function conectarBaseDatos() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('Falta MONGODB_URI en el archivo .env (ver .env.ejemplo)');
  }

  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  } catch (error) {
    throw new Error(
      `No se pudo conectar a MongoDB en ${uri}. ` +
        `Verifica que el servicio este activo (systemctl is-active mongod). ` +
        `Detalle: ${error.message}`
    );
  }

  return mongoose.connection;
}

export async function desconectarBaseDatos() {
  await mongoose.disconnect();
}
