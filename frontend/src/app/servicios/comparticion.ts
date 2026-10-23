import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { URL_API } from '../nucleo/configuracion';
import { CompartidoConmigo, CompartidoPorMi, Nivel, PermisoDetallado, RecursoCompartible, UsuarioResumen } from '../nucleo/modelos';

/**
 * Llamadas de comparticion. La misma API sirve para carpetas y archivos
 * (/api/recursos/:tipo/...) porque ambos EMBEBEN `compartidoCon` con el mismo
 * esquema.
 */
@Injectable({ providedIn: 'root' })
export class Comparticion {
  private readonly http = inject(HttpClient);

  private url(recurso: RecursoCompartible) {
    return `${URL_API}/recursos/${recurso.tipo === 'carpeta' ? 'carpetas' : 'archivos'}/${recurso._id}/compartir`;
  }

  permisos(recurso: RecursoCompartible): Observable<{ compartidoCon: PermisoDetallado[] }> {
    return this.http.get<{ compartidoCon: PermisoDetallado[] }>(this.url(recurso));
  }

  compartir(recurso: RecursoCompartible, usuarioId: string, nivel: Nivel) {
    return this.http.post<unknown>(this.url(recurso), { usuarioId, nivel });
  }

  cambiarNivel(recurso: RecursoCompartible, usuarioId: string, nivel: Nivel) {
    return this.http.patch<unknown>(`${this.url(recurso)}/${usuarioId}`, { nivel });
  }

  revocar(recurso: RecursoCompartible, usuarioId: string) {
    return this.http.delete<unknown>(`${this.url(recurso)}/${usuarioId}`);
  }

  /** Usuarios activos con quienes se puede compartir (sin uno mismo). */
  destinatarios(): Observable<UsuarioResumen[]> {
    return this.http.get<UsuarioResumen[]>(`${URL_API}/compartidos/usuarios`);
  }

  conmigo(): Observable<CompartidoConmigo[]> {
    return this.http.get<CompartidoConmigo[]>(`${URL_API}/compartidos/conmigo`);
  }

  porMi(): Observable<CompartidoPorMi[]> {
    return this.http.get<CompartidoPorMi[]>(`${URL_API}/compartidos/por-mi`);
  }
}
