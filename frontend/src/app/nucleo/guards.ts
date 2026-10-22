import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Autenticacion } from './autenticacion';
import { Avisos } from './avisos';

/**
 * Guards de rutas. Solo deciden que pantallas se muestran: no son seguridad.
 * Aunque alguien los saltara, la API respondera 401/403 porque verifica el
 * token y el rol en cada peticion (seccion 6 del modelo).
 */

/** Rutas que requieren sesion iniciada; si no, al login (y luego de vuelta). */
export const sesionGuard: CanActivateFn = (_ruta, estado) => {
  const autenticacion = inject(Autenticacion);
  if (autenticacion.token()) return true;
  return inject(Router).createUrlTree(['/login'], { queryParams: { volver: estado.url } });
};

/** Rutas de administracion: un usuario normal vuelve al inicio con un aviso. */
export const administradorGuard: CanActivateFn = () => {
  if (inject(Autenticacion).esAdministrador()) return true;
  inject(Avisos).error('No tienes permiso para entrar a esa sección: es solo para administradores.');
  return inject(Router).createUrlTree(['/']);
};

/** El login solo para quien no inicio sesion: si ya la tiene, va al inicio. */
export const invitadoGuard: CanActivateFn = () => {
  if (!inject(Autenticacion).token()) return true;
  return inject(Router).createUrlTree(['/']);
};
