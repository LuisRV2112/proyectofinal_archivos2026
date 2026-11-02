import { HttpClient, HttpErrorResponse, HttpEvent, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, from, map, Observable, switchMap, throwError } from 'rxjs';
import { URL_API } from '../nucleo/configuracion';
import { Archivo, Carpeta, ContenidoCarpeta, Paginado } from '../nucleo/modelos';

export interface FiltrosBusqueda {
  texto?: string;
  extension?: string;
  carpetaId?: string;
  enSubarbol?: boolean;
  desde?: string;
  hasta?: string;
  pagina?: number;
  limite?: number;
}

// Llamadas a la API de carpetas y archivos.
@Injectable({ providedIn: 'root' })
export class Documentos {
  private readonly http = inject(HttpClient);

  // Carpetas

  // En su raiz el usuario siempre es propietario.
  raiz(): Observable<ContenidoCarpeta> {
    return this.http
      .get<Omit<ContenidoCarpeta, 'carpeta' | 'acceso' | 'migas'>>(`${URL_API}/carpetas/raiz`)
      .pipe(map((r) => ({ ...r, carpeta: null, acceso: { nivel: 'PROPIETARIO', via: 'propietario' }, migas: [] })));
  }

  carpeta(id: string): Observable<ContenidoCarpeta> {
    return this.http.get<ContenidoCarpeta>(`${URL_API}/carpetas/${id}`);
  }

  // null = raiz
  contenido(id: string | null): Observable<ContenidoCarpeta> {
    return id ? this.carpeta(id) : this.raiz();
  }

  crearCarpeta(nombre: string, padreId: string | null): Observable<Carpeta> {
    return this.http.post<Carpeta>(`${URL_API}/carpetas`, { nombre, padreId });
  }

  renombrarCarpeta(id: string, nombre: string) {
    return this.http.patch<{ carpeta: Carpeta }>(`${URL_API}/carpetas/${id}`, { nombre });
  }

  moverCarpeta(id: string, padreId: string | null) {
    return this.http.patch<{ carpeta: Carpeta }>(`${URL_API}/carpetas/${id}/mover`, { padreId });
  }

  eliminarCarpeta(id: string) {
    return this.http.delete<unknown>(`${URL_API}/carpetas/${id}`);
  }

  // Archivos

  // Se observan los eventos para mostrar el progreso.
  subir(archivo: File, carpetaId: string | null): Observable<HttpEvent<Archivo>> {
    const datos = new FormData();
    datos.append('archivo', archivo, archivo.name);
    if (carpetaId) datos.append('carpetaId', carpetaId);
    return this.http.post<Archivo>(`${URL_API}/archivos`, datos, { reportProgress: true, observe: 'events' });
  }

  // Usa el mismo endpoint que la subida para pasar por las mismas validaciones.
  crearArchivo(nombre: string, contenido: string, carpetaId: string | null, etiquetas = ''): Observable<Archivo> {
    const tipo = nombre.toLowerCase().endsWith('.md') ? 'text/markdown' : 'text/plain';
    const datos = new FormData();
    datos.append('archivo', new File([contenido], nombre, { type: tipo }), nombre);
    if (carpetaId) datos.append('carpetaId', carpetaId);
    if (etiquetas) datos.append('etiquetas', etiquetas);
    datos.append('origen', 'editor');
    return this.http.post<Archivo>(`${URL_API}/archivos`, datos);
  }

  texto(id: string): Observable<string> {
    return this.http.get(`${URL_API}/archivos/${id}/contenido`, { responseType: 'text' });
  }

  // Un <a href> no envia el token, por eso se pide como Blob.
  descargar(archivo: Pick<Archivo, '_id' | 'nombre'>): Observable<void> {
    return this.http.get(`${URL_API}/archivos/${archivo._id}/descargar`, { responseType: 'blob' }).pipe(
      map((blob) => {
        const url = URL.createObjectURL(blob);
        const enlace = document.createElement('a');
        enlace.href = url;
        enlace.download = archivo.nombre;
        enlace.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }),
      // El error tambien llega como Blob; se pasa a texto para leer el mensaje.
      catchError((error: unknown) => {
        if (!(error instanceof HttpErrorResponse) || !(error.error instanceof Blob)) return throwError(() => error);
        return from(error.error.text()).pipe(
          switchMap((texto) =>
            throwError(() => new HttpErrorResponse({ error: texto, status: error.status, statusText: error.statusText })),
          ),
        );
      }),
    );
  }

  renombrarArchivo(id: string, nombre: string) {
    return this.http.patch<Archivo>(`${URL_API}/archivos/${id}`, { nombre });
  }

  moverArchivo(id: string, carpetaId: string | null) {
    return this.http.patch<Archivo>(`${URL_API}/archivos/${id}/mover`, { carpetaId });
  }

  eliminarArchivo(id: string) {
    return this.http.delete<unknown>(`${URL_API}/archivos/${id}`);
  }

  buscar(filtros: FiltrosBusqueda): Observable<Paginado<Archivo>> {
    let params = new HttpParams();
    // La API rechaza parametros vacios.
    for (const [clave, valor] of Object.entries(filtros)) {
      if (valor !== undefined && valor !== null && valor !== '') params = params.set(clave, String(valor));
    }
    return this.http.get<Paginado<Archivo>>(`${URL_API}/archivos/buscar`, { params });
  }
}
