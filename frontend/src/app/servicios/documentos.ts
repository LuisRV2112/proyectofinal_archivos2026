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

/**
 * Llamadas a la API de carpetas y archivos. Las pantallas no arman URLs: todo
 * pasa por aqui, y el interceptor agrega el token.
 */
@Injectable({ providedIn: 'root' })
export class Documentos {
  private readonly http = inject(HttpClient);

  // --- Carpetas ---

  /** Raiz del usuario. La API no devuelve `acceso` aqui: en su raiz siempre es propietario. */
  raiz(): Observable<ContenidoCarpeta> {
    return this.http
      .get<Omit<ContenidoCarpeta, 'carpeta' | 'acceso' | 'migas'>>(`${URL_API}/carpetas/raiz`)
      .pipe(map((r) => ({ ...r, carpeta: null, acceso: { nivel: 'PROPIETARIO', via: 'propietario' }, migas: [] })));
  }

  carpeta(id: string): Observable<ContenidoCarpeta> {
    return this.http.get<ContenidoCarpeta>(`${URL_API}/carpetas/${id}`);
  }

  /** null = la raiz. */
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

  // --- Archivos ---

  /**
   * Subida multipart. Se observan los eventos HTTP para mostrar el progreso:
   * el archivo viaja en memoria hasta el backend, que lo pasa a GridFS.
   */
  subir(archivo: File, carpetaId: string | null): Observable<HttpEvent<Archivo>> {
    const datos = new FormData();
    datos.append('archivo', archivo, archivo.name);
    if (carpetaId) datos.append('carpetaId', carpetaId);
    return this.http.post<Archivo>(`${URL_API}/archivos`, datos, { reportProgress: true, observe: 'events' });
  }

  /**
   * Crear un archivo con texto escrito en la aplicacion. Va al mismo
   * POST /api/archivos que la subida, como un archivo armado en el navegador:
   * asi pasa por las mismas validaciones (extension, nombre, cuota) y GridFS.
   * `origen=editor` solo cambia como lo describe el historial.
   */
  crearArchivo(nombre: string, contenido: string, carpetaId: string | null, etiquetas = ''): Observable<Archivo> {
    const tipo = nombre.toLowerCase().endsWith('.md') ? 'text/markdown' : 'text/plain';
    const datos = new FormData();
    datos.append('archivo', new File([contenido], nombre, { type: tipo }), nombre);
    if (carpetaId) datos.append('carpetaId', carpetaId);
    if (etiquetas) datos.append('etiquetas', etiquetas);
    datos.append('origen', 'editor');
    return this.http.post<Archivo>(`${URL_API}/archivos`, datos);
  }

  /** Texto del archivo para la vista previa. */
  texto(id: string): Observable<string> {
    return this.http.get(`${URL_API}/archivos/${id}/contenido`, { responseType: 'text' });
  }

  /**
   * Descarga. No basta un <a href>: la API exige el token en la cabecera, y
   * un enlace no la envia. Se pide el contenido como Blob (con el token, via
   * interceptor) y se entrega al navegador con un enlace temporal.
   */
  descargar(archivo: Pick<Archivo, '_id' | 'nombre'>): Observable<void> {
    return this.http.get(`${URL_API}/archivos/${archivo._id}/descargar`, { responseType: 'blob' }).pipe(
      map((blob) => {
        const url = URL.createObjectURL(blob);
        const enlace = document.createElement('a');
        enlace.href = url;
        enlace.download = archivo.nombre;
        enlace.click();
        // Se libera despues de que el navegador tome el archivo.
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }),
      // Con responseType 'blob' tambien el error JSON llega como Blob: se lee
      // como texto para que mensajeDeError muestre el mensaje de la API.
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
    // Solo los filtros con valor: un parametro vacio la API lo rechaza (400).
    for (const [clave, valor] of Object.entries(filtros)) {
      if (valor !== undefined && valor !== null && valor !== '') params = params.set(clave, String(valor));
    }
    return this.http.get<Paginado<Archivo>>(`${URL_API}/archivos/buscar`, { params });
  }
}
