import { Injectable, signal } from '@angular/core';

export interface Aviso {
  tipo: 'exito' | 'error' | 'info';
  texto: string;
}

/**
 * Mensajes breves que se muestran sobre cualquier pantalla (el layout los
 * dibuja). Asi un guard o un servicio pueden avisar algo sin depender de la
 * pantalla en que se este.
 */
@Injectable({ providedIn: 'root' })
export class Avisos {
  readonly actual = signal<Aviso | null>(null);
  private temporizador?: ReturnType<typeof setTimeout>;

  exito(texto: string) {
    this.mostrar({ tipo: 'exito', texto });
  }

  error(texto: string) {
    // Los errores quedan mas tiempo: hay que alcanzar a leerlos.
    this.mostrar({ tipo: 'error', texto }, 7000);
  }

  info(texto: string) {
    this.mostrar({ tipo: 'info', texto });
  }

  cerrar() {
    clearTimeout(this.temporizador);
    this.actual.set(null);
  }

  private mostrar(aviso: Aviso, duracion = 4000) {
    clearTimeout(this.temporizador);
    this.actual.set(aviso);
    this.temporizador = setTimeout(() => this.actual.set(null), duracion);
  }
}
