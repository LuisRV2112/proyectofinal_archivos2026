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

export type Nivel = 'LECTURA' | 'COMENTARIO' | 'EDICION';
export type NivelAcceso = Nivel | 'PROPIETARIO';

/** Permiso EMBEBIDO en el recurso (compartidoCon). */
export interface Permiso {
  usuarioId: string;
  nivel: Nivel;
  otorgadoPor: string;
  otorgadoEn: string;
}

interface Recurso {
  _id: string;
  nombre: string;
  propietarioId: string;
  ancestros: string[];
  compartidoCon: Permiso[];
  creadoEn: string;
  actualizadoEn: string;
}

export interface Carpeta extends Recurso {
  padreId: string | null;
  ruta: string;
}

export interface Archivo extends Recurso {
  extension: 'txt' | 'md';
  mimeType: string;
  tamano: number;
  carpetaId: string | null;
  etiquetas: string[];
  /** Ruta de su carpeta; la agregan la busqueda y el detalle. */
  ubicacion?: string;
}

/** Como llega el usuario a un recurso: propio, compartido directo o heredado. */
export interface Acceso {
  nivel: NivelAcceso;
  via: string;
}

export interface Miga {
  _id: string;
  nombre: string;
  ruta: string;
}

/** GET /api/carpetas/raiz y GET /api/carpetas/:id */
export interface ContenidoCarpeta {
  carpeta: Carpeta | null;
  acceso: Acceso;
  migas: Miga[];
  carpetas: Carpeta[];
  archivos: Archivo[];
}

export interface Paginado<T> {
  total: number;
  pagina: number;
  limite: number;
  resultados: T[];
}
