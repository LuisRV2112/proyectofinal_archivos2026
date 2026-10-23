import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { URL_API } from '../nucleo/configuracion';
import { Accion, EntradaActividad, Paginado, RecursoTipo, UsuarioResumen } from '../nucleo/modelos';

/**
 * Reportes (GET /api/reportes/...). Todos los calcula MongoDB con un
 * aggregation pipeline; el frontend solo arma los filtros y pinta la tabla.
 */
@Injectable({ providedIn: 'root' })
export class Reportes {
  private readonly http = inject(HttpClient);

  /** `ruta` relativa a /api/reportes; los filtros vacios no se envian. */
  consultar<T>(ruta: string, filtros: Record<string, string | number | boolean | null | undefined>): Observable<T> {
    let params = new HttpParams();
    for (const [clave, valor] of Object.entries(filtros)) {
      if (valor != null && valor !== '') params = params.set(clave, String(valor));
    }
    return this.http.get<T>(`${URL_API}/reportes/${ruta}`, { params });
  }
}

// --- Forma de la respuesta de cada reporte ---

type TipoRecurso = 'CARPETA' | 'ARCHIVO';

/** 1. GET archivos/por-tipo */
export interface ArchivosPorTipo {
  total: number;
  tipos: {
    extension: 'txt' | 'md';
    cantidad: number;
    activos: number;
    enPapelera: number;
    bytes: number;
    tamanoPromedio: number;
    porcentaje: number;
  }[];
}

/** 2. GET archivos/por-fecha */
export type ArchivosPorFecha = Paginado<{
  _id: string;
  nombre: string;
  extension: 'txt' | 'md';
  tamano: number;
  creadoEn: string;
  ubicacion: string;
  enPapelera: boolean;
  propietario: UsuarioResumen | null;
}>;

interface ConteoAccion {
  accion: Accion;
  cantidad: number;
}

/** 3. GET archivos/mas-operaciones */
export type ArchivosMasOperaciones = {
  archivoId: string;
  nombre: string;
  extension?: 'txt' | 'md';
  /** false = eliminado definitivamente: el nombre sale del historial. */
  existe: boolean;
  enPapelera: boolean;
  propietario?: UsuarioResumen | null;
  operaciones: number;
  ultimaOperacion: string;
  porAccion: ConteoAccion[];
}[];

/** 4. GET usuarios/top-archivos */
export type TopUsuariosArchivos = {
  posicion: number;
  usuarioId: string;
  username: string;
  nombreCompleto: string;
  activo: boolean;
  archivos: number;
  porTipo: { md: number; txt: number };
  enPapelera: number;
  bytes: number;
  almacenamientoUsado: number;
}[];

/** 5. GET usuarios/mas-compartidos */
export type UsuariosMasCompartidos = {
  usuarioId: string;
  username: string;
  nombreCompleto: string;
  recursos: number;
  carpetas: number;
  archivos: number;
  permisosOtorgados: number;
  usuariosDistintos: number;
}[];

/** Recurso de los reportes de comparticion (carpeta o archivo, via $unionWith). */
interface RecursoReporte {
  _id: string;
  nombre: string;
  tipo: TipoRecurso;
  ubicacion: string;
}

export interface RecursoCompartidoReporte extends RecursoReporte {
  usuarios: number;
  compartidoCon: { usuario: UsuarioResumen; nivel: string; otorgadoEn: string }[];
  propietario?: UsuarioResumen | null;
}

/** 6. GET comparticion/mas-compartidos */
export type RecursosMasCompartidos = RecursoCompartidoReporte[];

/** 7. GET comparticion/compartidos-por */
export type CompartidosPorUsuario = Paginado<RecursoCompartidoReporte> & { usuario: UsuarioResumen };

/** 8. GET comparticion/recibidos */
export type RecibidosPorUsuario = Paginado<
  RecursoReporte & {
    nivel: string;
    recibidoEn: string;
    propietario: UsuarioResumen | null;
    otorgadoPor: UsuarioResumen | null;
  }
> & { usuario: UsuarioResumen };

/** 9. GET actividad/historial */
export type HistorialUsuario = Paginado<EntradaActividad> & {
  usuario: UsuarioResumen;
  desde: string | null;
  hasta: string | null;
  resumen: (ConteoAccion & { ultima: string })[];
};

/** 10. GET actividad/por-tipo */
export interface OperacionesPorTipo {
  total: number;
  acciones: (ConteoAccion & { porcentaje: number; porRecurso: { recursoTipo: RecursoTipo; cantidad: number }[] })[];
}

/** 11. GET actividad/por-periodo */
export interface OperacionesPorPeriodo {
  periodo: 'day' | 'week' | 'month' | 'year';
  zonaHoraria: string;
  total: number;
  periodos: { etiqueta: string; inicio: string; cantidad: number; porAccion: ConteoAccion[] }[];
}

/** 12. GET actividad/principales */
export type PrincipalesAcciones = (ConteoAccion & {
  posicion: number;
  usuariosDistintos: number;
  ultima: string;
  quienesMas: { usuario: UsuarioResumen | null; cantidad: number }[];
})[];
