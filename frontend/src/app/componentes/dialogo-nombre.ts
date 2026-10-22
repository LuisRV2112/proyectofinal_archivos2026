import { Component, ElementRef, input, OnInit, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';

/** Pide un nombre: crear carpeta y renombrar. El error lo muestra el padre (viene de la API). */
@Component({
  selector: 'app-dialogo-nombre',
  imports: [FormsModule],
  template: `
    <div class="fondo-dialogo" (click)="cancelar.emit()">
      <form class="dialogo" role="dialog" aria-modal="true" (click)="$event.stopPropagation()" (ngSubmit)="enviar()">
        <h2>{{ titulo() }}</h2>
        <label class="campo">
          <span>Nombre</span>
          <input #campo name="nombre" [(ngModel)]="nombre" maxlength="255" required />
        </label>
        @if (error()) {
          <div class="alerta alerta-error">{{ error() }}</div>
        }
        <div class="dialogo-acciones">
          <button class="boton" type="button" (click)="cancelar.emit()" [disabled]="ocupado()">Cancelar</button>
          <button class="boton boton-primario" type="submit" [disabled]="ocupado() || !nombre().trim()">
            {{ ocupado() ? 'Guardando…' : textoBoton() }}
          </button>
        </div>
      </form>
    </div>
  `,
})
export class DialogoNombre implements OnInit {
  readonly titulo = input.required<string>();
  readonly valorInicial = input('');
  readonly textoBoton = input('Guardar');
  readonly ocupado = input(false);
  readonly error = input<string | null>(null);
  readonly guardar = output<string>();
  readonly cancelar = output<void>();

  readonly nombre = signal('');
  private readonly campo = viewChild<ElementRef<HTMLInputElement>>('campo');

  ngOnInit() {
    this.nombre.set(this.valorInicial());
    // Al renombrar se selecciona el nombre SIN la extension, que es lo que
    // normalmente se cambia (la API no permite cambiar la extension).
    setTimeout(() => {
      const campo = this.campo()?.nativeElement;
      if (!campo) return;
      campo.focus();
      const punto = campo.value.lastIndexOf('.');
      campo.setSelectionRange(0, punto > 0 ? punto : campo.value.length);
    });
  }

  enviar() {
    const nombre = this.nombre().trim();
    if (nombre) this.guardar.emit(nombre);
  }
}
