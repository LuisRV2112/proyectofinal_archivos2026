import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { URL_API } from './configuracion';
import { Almacenamiento, Sesion } from './modelos';

const CLAVE_SESION = 'gestion-documental.sesion';

// El servidor no guarda sesiones (JWT), asi que el token se guarda en
// localStorage. El rol guardado solo cambia lo que se muestra; el backend
// valida todo en cada peticion.
@Injectable({ providedIn: 'root' })
export class Autenticacion {
  private readonly http = inject(HttpClient);

  readonly sesion = signal<Sesion | null>(leerSesionGuardada());
  readonly haySesion = computed(() => this.sesion() !== null);
  readonly esAdministrador = computed(() => this.sesion()?.rol === 'ADMINISTRADOR');
  // Se refresca al subir o borrar.
  readonly almacenamiento = signal<Almacenamiento | null>(null);

  iniciarSesion(username: string, password: string): Observable<Sesion> {
    return this.http.post<Sesion>(`${URL_API}/auth/login`, { username, password }).pipe(
      tap((sesion) => {
        localStorage.setItem(CLAVE_SESION, JSON.stringify(sesion));
        this.sesion.set(sesion);
      }),
    );
  }

  cerrarSesion() {
    localStorage.removeItem(CLAVE_SESION);
    this.sesion.set(null);
    this.almacenamiento.set(null);
  }

  // GET /api/auth/yo
  refrescarPerfil() {
    type Perfil = Pick<Sesion, 'nombreCompleto' | 'email'> & Almacenamiento;
    this.http.get<Perfil>(`${URL_API}/auth/yo`).subscribe({
      next: (perfil) => {
        const { almacenamientoUsado, cuotaAlmacenamiento, almacenamientoDisponible } = perfil;
        this.almacenamiento.set({ almacenamientoUsado, cuotaAlmacenamiento, almacenamientoDisponible });
        // Por si el administrador se edito a si mismo.
        const sesion = this.sesion();
        if (sesion && (sesion.nombreCompleto !== perfil.nombreCompleto || sesion.email !== perfil.email)) {
          const actualizada = { ...sesion, nombreCompleto: perfil.nombreCompleto, email: perfil.email };
          localStorage.setItem(CLAVE_SESION, JSON.stringify(actualizada));
          this.sesion.set(actualizada);
        }
      },
      error: () => {}, // El 401 lo maneja el interceptor.
    });
  }

  // null si no hay sesion o expiro.
  token(): string | null {
    const sesion = this.sesion();
    if (!sesion) return null;
    if (tokenExpirado(sesion.token)) {
      this.cerrarSesion();
      return null;
    }
    return sesion.token;
  }
}

function leerSesionGuardada(): Sesion | null {
  try {
    const texto = localStorage.getItem(CLAVE_SESION);
    if (!texto) return null;
    const sesion = JSON.parse(texto) as Sesion;
    return sesion.token && !tokenExpirado(sesion.token) ? sesion : null;
  } catch {
    return null;
  }
}

// Lee exp del JWT sin verificarlo (eso lo hace el backend), solo para no
// enviar un token vencido.
function tokenExpirado(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.exp === 'number' && payload.exp * 1000 <= Date.now();
  } catch {
    return true;
  }
}
