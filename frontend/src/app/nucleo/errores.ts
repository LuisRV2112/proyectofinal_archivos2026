import { HttpErrorResponse } from '@angular/common/http';
import { ErrorApi } from './modelos';

/**
 * Convierte un error HTTP en el mensaje que se muestra al usuario. El backend
 * siempre responde {estado, error, detalle}: se muestra ese texto ("Ya existe
 * una carpeta llamada Contratos") y no un "error" generico.
 */
export function mensajeDeError(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    // estado 0: la peticion ni siquiera llego (backend apagado, CORS, red).
    if (error.status === 0) return 'No se pudo conectar con el servidor. ¿Está encendido el backend?';
    const cuerpo = error.error as Partial<ErrorApi> | null;
    if (cuerpo && typeof cuerpo === 'object' && cuerpo.error) {
      return cuerpo.detalle ? `${cuerpo.error}. ${cuerpo.detalle}` : cuerpo.error;
    }
    return `Error ${error.status}: ${error.statusText}`;
  }
  return error instanceof Error ? error.message : 'Ocurrió un error inesperado';
}
