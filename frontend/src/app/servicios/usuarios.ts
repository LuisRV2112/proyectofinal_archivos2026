import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { URL_API } from '../nucleo/configuracion';
import { Usuario } from '../nucleo/modelos';

/** Gestion de usuarios (/api/usuarios): toda la API es solo del administrador. */
@Injectable({ providedIn: 'root' })
export class UsuariosApi {
  private readonly http = inject(HttpClient);

  listar(): Observable<Usuario[]> {
    return this.http.get<Usuario[]>(`${URL_API}/usuarios`);
  }
}
