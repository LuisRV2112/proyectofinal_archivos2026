import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { URL_API } from '../nucleo/configuracion';
import { ElementoPapelera, Papelera, ResultadoEliminacionDefinitiva, ResultadoRestaurar } from '../nucleo/modelos';

/** Llamadas de la papelera; la API usa "carpetas" | "archivos" en la ruta. */
@Injectable({ providedIn: 'root' })
export class PapeleraApi {
  private readonly http = inject(HttpClient);

  private url(elemento: ElementoPapelera) {
    return `${URL_API}/papelera/${elemento.tipo === 'CARPETA' ? 'carpetas' : 'archivos'}/${elemento._id}`;
  }

  listar() {
    return this.http.get<Papelera>(`${URL_API}/papelera`);
  }

  restaurar(elemento: ElementoPapelera) {
    return this.http.post<ResultadoRestaurar>(`${this.url(elemento)}/restaurar`, {});
  }

  eliminarDefinitivamente(elemento: ElementoPapelera) {
    return this.http.delete<ResultadoEliminacionDefinitiva>(this.url(elemento));
  }
}
