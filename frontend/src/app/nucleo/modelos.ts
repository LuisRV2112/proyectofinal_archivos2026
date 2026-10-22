/** Tipos de las respuestas de la API que usa mas de una pantalla. */

export type Rol = 'ADMINISTRADOR' | 'USUARIO';

/** Lo que devuelve POST /api/auth/login (sin passwordHash: el backend nunca lo envia). */
export interface Sesion {
  token: string;
  expiraEn: string;
  id: string;
  username: string;
  nombreCompleto: string;
  email: string;
  rol: Rol;
}

/** Formato de error comun de la API (middleware de errores del backend). */
export interface ErrorApi {
  estado: number;
  error: string;
  detalle?: string;
  fecha: string;
}
