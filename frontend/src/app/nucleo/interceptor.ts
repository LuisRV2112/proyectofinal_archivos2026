import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { Autenticacion } from './autenticacion';
import { Avisos } from './avisos';
import { URL_API } from './configuracion';

/**
 * Interceptor HTTP: agrega `Authorization: Bearer <token>` a toda peticion a
 * la API, para que ningun servicio tenga que acordarse de hacerlo.
 *
 * Si la API responde 401 (token vencido o invalido, o usuario desactivado),
 * la sesion local ya no sirve: se borra y se vuelve al login. El 401 del
 * propio login (contrasena incorrecta) se deja pasar para que la pantalla de
 * login muestre su mensaje.
 */
export const autenticacionInterceptor: HttpInterceptorFn = (peticion, siguiente) => {
  const autenticacion = inject(Autenticacion);
  const router = inject(Router);
  const avisos = inject(Avisos);

  // Solo a nuestra API: el token nunca debe viajar a otro servidor.
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
