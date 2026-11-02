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

// usuario es null en un LOGIN_FALLIDO de un username que no existe.
export type EntradaConUsuario = EntradaActividad & { usuario: UsuarioResumen | null };

// Si no es administrador, la API solo devuelve su propio historial.
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
