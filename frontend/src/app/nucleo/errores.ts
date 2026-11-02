import { HttpErrorResponse } from '@angular/common/http';
import { ErrorApi } from './modelos';

// Muestra el mensaje { error, detalle } que envia el backend.
export function mensajeDeError(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    // 0: no llego al servidor
    if (error.status === 0) return 'No se pudo conectar con el servidor. ¿Está encendido el backend?';
    // Con responseType 'text' el error llega como texto.
    let cuerpo = error.error as Partial<ErrorApi> | string | null;
    if (typeof cuerpo === 'string') {
      try {
        cuerpo = JSON.parse(cuerpo) as Partial<ErrorApi>;
      } catch {
        cuerpo = null;
      }
    }
    if (cuerpo && typeof cuerpo === 'object' && cuerpo.error) {
      return cuerpo.detalle ? `${cuerpo.error}. ${cuerpo.detalle}` : cuerpo.error;
    }
    return `Error ${error.status}: ${error.statusText}`;
  }
  return error instanceof Error ? error.message : 'Ocurrió un error inesperado';
}
