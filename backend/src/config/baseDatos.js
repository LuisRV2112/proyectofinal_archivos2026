import mongoose from 'mongoose';

// 5 s de espera: si mongod no esta activo falla rapido en vez de esperar 30 s.
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
