import { Type } from '@angular/core';
import { TablaHistorial, TablaOperacionesPorPeriodo, TablaOperacionesPorTipo, TablaPrincipalesAcciones } from './tablas-actividad';
import { TablaArchivosMasOperaciones, TablaArchivosPorFecha, TablaArchivosPorTipo, TablaCarpetasMasArchivos } from './tablas-archivos';
import { TablaCompartidosPor, TablaNuncaCompartidos, TablaRecibidos, TablaRecursosMasCompartidos } from './tablas-comparticion';
import { TablaTopUsuariosArchivos, TablaUsuariosMasCompartidos } from './tablas-usuarios';

/** Filtros que puede llevar un reporte; cada uno es un parametro de la API. */
export type Filtro =
  | 'rango' // desde, hasta
  | 'extension'
  | 'incluirPapelera'
  | 'limite'
  | 'tipo' // CARPETA | ARCHIVO
  | 'usuario' // usuarioId: solo lo ve el administrador
  | 'accion'
  | 'recursoTipo'
  | 'periodo'
  | 'excluirSesion'
  | 'contar'; // directos | subarbol

export interface DefinicionReporte {
  clave: string;
  numero: number;
  grupo: string;
  titulo: string;
  descripcion: string;
  /** Ruta bajo /api/reportes. */
  ruta: string;
  /** Seccion 6: archivos, usuarios y actividad global son solo del administrador. */
  soloAdmin: boolean;
  filtros: Filtro[];
  /** El backend exige desde y/o hasta (reportes 2 y 9). */
  rangoObligatorio?: boolean;
  /** Respuesta {total, pagina, limite, resultados}: la pagina la controla la vista. */
  paginado?: boolean;
  /**
   * Que significa no elegir usuario (solo administrador): "yo" en los
   * reportes de un usuario concreto (7 a 9), "todos" en los que por defecto
   * abarcan el sistema entero (13 y 14).
   */
  sinUsuario?: 'yo' | 'todos';
  /** Valor por defecto del filtro "limite". */
  limite?: number;
  tabla: Type<unknown>;
}

/**
 * Los 12 reportes de la seccion 7 mas el 13 y el 14, que pide la hoja de
 * calificacion. Las pantallas se arman desde esta lista:
 * agregar un reporte es agregar una entrada y su tabla, sin tocar la vista.
 */
export const REPORTES: DefinicionReporte[] = [
  {
    clave: 'archivos-por-tipo',
    numero: 1,
    grupo: 'Archivos y almacenamiento',
    titulo: 'Archivos por tipo',
    descripcion: 'Cantidad de archivos y espacio que ocupan, agrupados por extensión.',
    ruta: 'archivos/por-tipo',
    soloAdmin: true,
    filtros: ['incluirPapelera'],
    tabla: TablaArchivosPorTipo,
  },
  {
    clave: 'archivos-por-fecha',
    numero: 2,
    grupo: 'Archivos y almacenamiento',
    titulo: 'Archivos por rango de fechas',
    descripcion: 'Archivos almacenados (subidos) dentro de un rango de fechas.',
    ruta: 'archivos/por-fecha',
    soloAdmin: true,
    filtros: ['rango', 'extension', 'incluirPapelera'],
    rangoObligatorio: true,
    paginado: true,
    tabla: TablaArchivosPorFecha,
  },
  {
    clave: 'archivos-mas-operaciones',
    numero: 3,
    grupo: 'Archivos y almacenamiento',
    titulo: 'Archivos con más operaciones',
    descripcion: 'Ranking de archivos según las operaciones registradas en el historial.',
    ruta: 'archivos/mas-operaciones',
    soloAdmin: true,
    filtros: ['rango', 'limite'],
    limite: 10,
    tabla: TablaArchivosMasOperaciones,
  },
  {
    clave: 'carpetas-mas-archivos',
    numero: 14,
    grupo: 'Archivos y almacenamiento',
    titulo: 'Carpetas con más archivos',
    descripcion: 'Carpetas ordenadas por cantidad de archivos: los que tienen directamente o en todo su subárbol.',
    ruta: 'archivos/carpetas-mas-archivos',
    soloAdmin: true,
    filtros: ['contar', 'usuario', 'limite'],
    sinUsuario: 'todos',
    limite: 10,
    tabla: TablaCarpetasMasArchivos,
  },
  {
    clave: 'usuarios-top-archivos',
    numero: 4,
    grupo: 'Usuarios',
    titulo: 'Top usuarios por archivos',
    descripcion: 'Los usuarios con más archivos almacenados.',
    ruta: 'usuarios/top-archivos',
    soloAdmin: true,
    filtros: ['incluirPapelera', 'limite'],
    limite: 10,
    tabla: TablaTopUsuariosArchivos,
  },
  {
    clave: 'usuarios-mas-compartidos',
    numero: 5,
    grupo: 'Usuarios',
    titulo: 'Usuarios que más comparten',
    descripcion: 'Usuarios con mayor cantidad de recursos compartidos.',
    ruta: 'usuarios/mas-compartidos',
    soloAdmin: true,
    filtros: ['limite'],
    limite: 10,
    tabla: TablaUsuariosMasCompartidos,
  },
  {
    clave: 'recursos-mas-compartidos',
    numero: 6,
    grupo: 'Compartición',
    titulo: 'Recursos compartidos con más usuarios',
    descripcion: 'Archivos y carpetas compartidos con más personas. Un usuario ve solo los suyos.',
    ruta: 'comparticion/mas-compartidos',
    soloAdmin: false,
    filtros: ['tipo', 'limite'],
    limite: 10,
    tabla: TablaRecursosMasCompartidos,
  },
  {
    clave: 'compartidos-por',
    numero: 7,
    grupo: 'Compartición',
    titulo: 'Recursos compartidos por un usuario',
    descripcion: 'Lo que un usuario ha compartido, con quién y con qué nivel.',
    ruta: 'comparticion/compartidos-por',
    soloAdmin: false,
    filtros: ['usuario', 'tipo'],
    paginado: true,
    tabla: TablaCompartidosPor,
  },
  {
    clave: 'recibidos',
    numero: 8,
    grupo: 'Compartición',
    titulo: 'Recursos recibidos por un usuario',
    descripcion: 'Lo que han compartido con un usuario, quién y cuándo.',
    ruta: 'comparticion/recibidos',
    soloAdmin: false,
    filtros: ['usuario', 'tipo'],
    paginado: true,
    tabla: TablaRecibidos,
  },
  {
    clave: 'nunca-compartidos',
    numero: 13,
    grupo: 'Compartición',
    titulo: 'Archivos que nunca han sido compartidos',
    descripcion:
      'Archivos que nadie más ha podido ver: nunca se compartieron, ni directamente ni a través de su carpeta. Un usuario ve solo los suyos.',
    ruta: 'comparticion/nunca-compartidos',
    soloAdmin: false,
    filtros: ['usuario', 'extension'],
    sinUsuario: 'todos',
    paginado: true,
    tabla: TablaNuncaCompartidos,
  },
  {
    clave: 'historial',
    numero: 9,
    grupo: 'Actividad',
    titulo: 'Historial de un usuario por fechas',
    descripcion: 'Operaciones de un usuario dentro de un rango de fechas, con su resumen.',
    ruta: 'actividad/historial',
    soloAdmin: false,
    filtros: ['usuario', 'rango', 'accion'],
    rangoObligatorio: true,
    paginado: true,
    tabla: TablaHistorial,
  },
  {
    clave: 'operaciones-por-tipo',
    numero: 10,
    grupo: 'Actividad',
    titulo: 'Operaciones por tipo',
    descripcion: 'Cantidad de operaciones de todo el sistema agrupadas por acción.',
    ruta: 'actividad/por-tipo',
    soloAdmin: true,
    filtros: ['rango', 'recursoTipo'],
    tabla: TablaOperacionesPorTipo,
  },
  {
    clave: 'operaciones-por-periodo',
    numero: 11,
    grupo: 'Actividad',
    titulo: 'Operaciones por período',
    descripcion: 'Operaciones agrupadas por día, semana, mes o año ($dateTrunc).',
    ruta: 'actividad/por-periodo',
    soloAdmin: true,
    filtros: ['periodo', 'rango', 'accion'],
    tabla: TablaOperacionesPorPeriodo,
  },
  {
    clave: 'principales-acciones',
    numero: 12,
    grupo: 'Actividad',
    titulo: 'Principales acciones',
    descripcion: 'Las acciones más realizadas y quiénes las realizan.',
    ruta: 'actividad/principales',
    soloAdmin: true,
    filtros: ['rango', 'excluirSesion', 'limite'],
    limite: 5,
    tabla: TablaPrincipalesAcciones,
  },
];
