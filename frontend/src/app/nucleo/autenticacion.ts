import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { URL_API } from './configuracion';
import { Sesion } from './modelos';

const CLAVE_SESION = 'gestion-documental.sesion';

/**
 * Sesion del usuario: login, token y cierre de sesion.
 *
 * La API es sin estado (JWT): el servidor no guarda sesiones, asi que el
 * cliente conserva el token y lo envia en cada peticion (lo agrega el
 * interceptor). Se guarda en localStorage para que recargar la pagina no
 * cierre la sesion.
 *
 * Los datos del usuario que se guardan aqui son solo para la interfaz
 * (mostrar el nombre, armar el menu segun el rol). La seguridad real esta en
 * el backend, que verifica el token y el rol en cada peticion: alguien que
 * edite localStorage solo cambiaria lo que ve, no lo que puede hacer.
 */
@Injectable({ providedIn: 'root' })
export class Autenticacion {
  private readonly http = inject(HttpClient);

  readonly sesion = signal<Sesion | null>(leerSesionGuardada());
  readonly haySesion = computed(() => this.sesion() !== null);
  readonly esAdministrador = computed(() => this.sesion()?.rol === 'ADMINISTRADOR');
  /** Bytes usados (dato denormalizado del usuario); se refresca tras subir o borrar. */
  readonly almacenamientoUsado = signal<number | null>(null);

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
    this.almacenamientoUsado.set(null);
  }

  /** GET /api/auth/yo: datos actuales del usuario, incluido su almacenamiento. */
  refrescarPerfil() {
    type Perfil = Pick<Sesion, 'nombreCompleto' | 'email'> & { almacenamientoUsado: number };
    this.http.get<Perfil>(`${URL_API}/auth/yo`).subscribe({
      next: (perfil) => {
        this.almacenamientoUsado.set(perfil.almacenamientoUsado);
        // Nombre y correo pueden haber cambiado (el admin se edito a si mismo).
        const sesion = this.sesion();
        if (sesion && (sesion.nombreCompleto !== perfil.nombreCompleto || sesion.email !== perfil.email)) {
          const actualizada = { ...sesion, nombreCompleto: perfil.nombreCompleto, email: perfil.email };
          localStorage.setItem(CLAVE_SESION, JSON.stringify(actualizada));
          this.sesion.set(actualizada);
        }
      },
      error: () => {}, // Dato accesorio; un 401 ya lo maneja el interceptor.
    });
  }

  /** El token vigente, o null si no hay sesion o ya expiro. */
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

/**
 * Lee el campo `exp` del JWT (segundos desde 1970). El payload es JSON en
 * base64url: se puede leer sin la clave, pero NO verificar; eso lo hace el
 * backend. Aqui solo sirve para no enviar un token que ya se sabe vencido.
 */
function tokenExpirado(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.exp === 'number' && payload.exp * 1000 <= Date.now();
  } catch {
    return true;
  }
}
