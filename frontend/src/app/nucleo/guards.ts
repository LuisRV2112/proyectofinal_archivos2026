import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Autenticacion } from './autenticacion';
import { Avisos } from './avisos';

// Los guards solo controlan pantallas; la seguridad real esta en la API (401/403).

// Sin sesion manda al login.
export const sesionGuard: CanActivateFn = (_ruta, estado) => {
  const autenticacion = inject(Autenticacion);
  if (autenticacion.token()) return true;
  return inject(Router).createUrlTree(['/login'], { queryParams: { volver: estado.url } });
};

// Un usuario normal vuelve al inicio.
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
