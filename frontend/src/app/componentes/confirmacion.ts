import { Component, input, output } from '@angular/core';

/** Dialogo "¿Seguro?" antes de eliminar. */
@Component({
  selector: 'app-confirmacion',
  template: `
    <div class="fondo-dialogo" (click)="cancelar.emit()">
      <div class="dialogo" role="dialog" aria-modal="true" (click)="$event.stopPropagation()">
        <h2>{{ titulo() }}</h2>
        <p>{{ mensaje() }}</p>
        @if (error()) {
          <div class="alerta alerta-error">{{ error() }}</div>
        }
        <div class="dialogo-acciones">
          <button class="boton" type="button" (click)="cancelar.emit()" [disabled]="ocupado()">Cancelar</button>
          <button class="boton" [class.boton-peligro]="peligro()" [class.boton-primario]="!peligro()" type="button"
            (click)="aceptar.emit()" [disabled]="ocupado()">
            {{ ocupado() ? 'Procesando…' : textoBoton() }}
          </button>
        </div>
      </div>
    </div>
  `,
})
export class Confirmacion {
  readonly titulo = input.required<string>();
  readonly mensaje = input.required<string>();
  readonly textoBoton = input('Aceptar');
  readonly peligro = input(true);
  readonly ocupado = input(false);
  readonly error = input<string | null>(null);
  readonly aceptar = output<void>();
  readonly cancelar = output<void>();
}
