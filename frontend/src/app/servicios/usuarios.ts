import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { URL_API } from '../nucleo/configuracion';
import { Rol, Usuario } from '../nucleo/modelos';

export interface NuevoUsuario {
  username: string;
  email: string;
  nombreCompleto: string;
  rol: Rol;
  password: string;
  /** Bytes asignados; si se omite, el backend aplica la cuota por defecto (20 MB). */
  cuotaAlmacenamiento?: number;
}

/** El username no se modifica: es el identificador de inicio de sesion. */
export type CambiosUsuario = Partial<Omit<NuevoUsuario, 'username'>>;

/** Gestion de usuarios (/api/usuarios): toda la API es solo del administrador. */
@Injectable({ providedIn: 'root' })
export class UsuariosApi {
  private readonly http = inject(HttpClient);

  listar(filtros: { rol?: string; activo?: string } = {}): Observable<Usuario[]> {
    let params = new HttpParams();
    if (filtros.rol) params = params.set('rol', filtros.rol);
    if (filtros.activo) params = params.set('activo', filtros.activo);
    return this.http.get<Usuario[]>(`${URL_API}/usuarios`, { params });
  }

  crear(datos: NuevoUsuario): Observable<Usuario> {
    return this.http.post<Usuario>(`${URL_API}/usuarios`, datos);
  }

  actualizar(id: string, cambios: CambiosUsuario): Observable<Usuario> {
    return this.http.patch<Usuario>(`${URL_API}/usuarios/${id}`, cambios);
  }

  cambiarEstado(id: string, activo: boolean): Observable<Usuario> {
    return this.http.patch<Usuario>(`${URL_API}/usuarios/${id}/estado`, { activo });
  }
}
