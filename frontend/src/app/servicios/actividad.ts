import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { URL_API } from '../nucleo/configuracion';
import { EntradaActividad, Paginado, UsuarioResumen } from '../nucleo/modelos';

export interface FiltrosActividad {
  usuarioId?: string;
  accion?: string;
  recursoTipo?: string;
  desde?: string;
  hasta?: string;
  pagina: number;
  limite: number;
}

/** Entrada del historial con quien la hizo (null: LOGIN_FALLIDO de un username inexistente). */
export type EntradaConUsuario = EntradaActividad & { usuario: UsuarioResumen | null };

/**
 * Historial (GET /api/actividad). El mismo endpoint sirve para "mi actividad"
 * y para el historial global: la API impone el usuarioId del que pregunta si
 * no es administrador, asi que el frontend no puede ver de mas aunque quiera.
 */
@Injectable({ providedIn: 'root' })
export class ActividadApi {
  private readonly http = inject(HttpClient);

  listar(filtros: FiltrosActividad): Observable<Paginado<EntradaConUsuario>> {
    let params = new HttpParams();
    for (const [clave, valor] of Object.entries(filtros)) {
      if (valor !== undefined && valor !== '') params = params.set(clave, String(valor));
    }
    return this.http.get<Paginado<EntradaConUsuario>>(`${URL_API}/actividad`, { params });
  }
}
