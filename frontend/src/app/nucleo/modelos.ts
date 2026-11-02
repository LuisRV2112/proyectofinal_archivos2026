// Tipos de las respuestas de la API.

export type Rol = 'ADMINISTRADOR' | 'USUARIO';

// POST /api/auth/login
export interface Sesion {
  token: string;
  expiraEn: string;
  id: string;
  username: string;
  nombreCompleto: string;
  email: string;
  rol: Rol;
}

// Formato de error de la API.
export interface ErrorApi {
  estado: number;
  error: string;
  detalle?: string;
  fecha: string;
}

export type Nivel = 'LECTURA' | 'COMENTARIO' | 'EDICION';
export type NivelAcceso = Nivel | 'PROPIETARIO';

// Embebido en compartidoCon.
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
  // Solo en la busqueda y el detalle.
  ubicacion?: string;
}

// via: propietario, directo, heredado o administrador.
export interface Acceso {
  nivel: NivelAcceso;
  via: string;
}

export interface Miga {
  _id: string;
  nombre: string;
  ruta: string;
}

// GET /api/carpetas/raiz y /api/carpetas/:id
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

export interface UsuarioResumen {
  _id: string;
  username: string;
  nombreCompleto: string;
}

export interface RecursoCompartible {
  tipo: 'carpeta' | 'archivo';
  _id: string;
  nombre: string;
}

// GET /api/recursos/:tipo/:id/compartir, con populate.
export interface PermisoDetallado {
  usuarioId: UsuarioResumen;
  nivel: Nivel;
  otorgadoPor: UsuarioResumen;
  otorgadoEn: string;
}

// GET /api/compartidos/conmigo: solo trae el nivel del usuario.
export type CompartidoConmigo = (
  | ({ tipo: 'CARPETA' } & Omit<Carpeta, 'compartidoCon' | 'propietarioId'>)
  | ({ tipo: 'ARCHIVO' } & Omit<Archivo, 'compartidoCon' | 'propietarioId'>)
) & { propietario: UsuarioResumen; nivel: Nivel; otorgadoEn: string };

// GET /api/compartidos/por-mi
export type CompartidoPorMi = (
  | ({ tipo: 'CARPETA' } & Omit<Carpeta, 'compartidoCon'>)
  | ({ tipo: 'ARCHIVO' } & Omit<Archivo, 'compartidoCon'>)
) & { compartidoCon: (Omit<Permiso, 'usuarioId'> & { usuarioId: UsuarioResumen })[] };

// GET /api/papelera: solo la raiz de cada eliminacion.
export type ElementoPapelera = {
  _id: string;
  nombre: string;
  eliminadoEn: string;
  // null si la carpeta de origen ya no existe
  ubicacionOriginal: string | null;
} & (
  | { tipo: 'CARPETA'; contiene: { carpetas: number; archivos: number; bytes: number } }
  | { tipo: 'ARCHIVO'; extension: 'txt' | 'md'; tamano: number }
);

export interface Papelera {
  elementos: ElementoPapelera[];
  bytesOcupados: number;
}

export interface ResultadoRestaurar {
  nombre: string;
  ubicacion: string;
  restaurados: number;
  avisos: string[];
}

export interface ResultadoEliminacionDefinitiva {
  archivos: number;
  carpetas: number;
  bytesLiberados: number;
}

// Igual que ACCIONES en el modelo Actividad del backend.
export const ACCIONES = [
  'LOGIN',
  'LOGIN_FALLIDO',
  'CREAR_USUARIO',
  'MODIFICAR_USUARIO',
  'ACTIVAR_USUARIO',
  'DESACTIVAR_USUARIO',
  'CREAR_CARPETA',
  'ELIMINAR_CARPETA',
  'SUBIR',
  'DESCARGAR',
  'RENOMBRAR',
  'MOVER',
  'ELIMINAR',
  'RESTAURAR',
  'ELIMINAR_DEFINITIVO',
  'COMPARTIR',
  'MODIFICAR_PERMISO',
  'REVOCAR',
] as const;
export type Accion = (typeof ACCIONES)[number];
export type RecursoTipo = 'ARCHIVO' | 'CARPETA' | 'USUARIO';

export interface EntradaActividad {
  _id: string;
  accion: Accion;
  recursoTipo: RecursoTipo;
  recursoId: string | null;
  // Denormalizado: sigue legible si el recurso se borra.
  recursoNombre: string;
  detalle?: string;
  fecha: string;
}

// Bytes. El disponible lo calcula el backend, aqui no se recalcula.
export interface Almacenamiento {
  almacenamientoUsado: number;
  cuotaAlmacenamiento: number;
  almacenamientoDisponible: number;
}

export interface Usuario extends UsuarioResumen, Almacenamiento {
  email: string;
  rol: Rol;
  activo: boolean;
  creadoEn: string;
}
