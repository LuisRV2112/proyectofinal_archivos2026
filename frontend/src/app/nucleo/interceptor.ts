import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { Autenticacion } from './autenticacion';
import { Avisos } from './avisos';
import { URL_API } from './configuracion';

// Agrega el token a cada peticion. Con un 401 cierra la sesion y manda al
// login, menos en el propio login (contrasena incorrecta).
export const autenticacionInterceptor: HttpInterceptorFn = (peticion, siguiente) => {
  const autenticacion = inject(Autenticacion);
  const router = inject(Router);
  const avisos = inject(Avisos);

  // El token solo va a nuestra API.
  const esApi = peticion.url.startsWith(URL_API);
  const token = esApi ? autenticacion.token() : null;
  const conToken = token ? peticion.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : peticion;

  return siguiente(conToken).pipe(
    catchError((error: unknown) => {
      const esLogin = peticion.url === `${URL_API}/auth/login`;
      if (esApi && !esLogin && error instanceof HttpErrorResponse && error.status === 401) {
        autenticacion.cerrarSesion();
        avisos.info('Tu sesión expiró. Vuelve a iniciar sesión.');
        router.navigate(['/login'], { queryParams: { volver: router.url } });
      }
      return throwError(() => error);
    }),
  );
};
