import { Component, ElementRef, input, OnInit, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';

/** Lo que el dialogo entrega al explorador para crear el archivo. */
export interface NuevoArchivo {
  nombre: string;
  contenido: string;
  etiquetas: string;
}

/**
 * Crear un archivo escribiendo su contenido en la aplicacion, sin tenerlo en
 * el equipo. El nombre se arma con la extension elegida en una lista, asi no
 * se puede escribir una extension que el backend rechazaria. Los errores
 * (nombre repetido, sin espacio) los devuelve la API y llegan por `error`.
 */
@Component({
  selector: 'app-dialogo-nuevo-archivo',
  imports: [FormsModule],
  template: `
    <div class="fondo-dialogo" (click)="cancelar.emit()">
      <form class="dialogo dialogo-ancho" role="dialog" aria-modal="true" (click)="$event.stopPropagation()" (ngSubmit)="enviar()">
        <h2>Nuevo archivo</h2>
        <div class="nombre-archivo">
          <label class="campo">
            <span>Nombre</span>
            <input #campo name="nombre" [(ngModel)]="nombre" maxlength="250" required placeholder="p. ej. minuta-reunion" />
          </label>
          <label class="campo">
            <span>Tipo</span>
            <select name="extension" [(ngModel)]="extension">
              <option value="md">.md (Markdown)</option>
              <option value="txt">.txt (texto)</option>
            </select>
          </label>
        </div>
        <label class="campo">
          <span>Contenido</span>
          <textarea name="contenido" [(ngModel)]="contenido" rows="12" spellcheck="true"
            [placeholder]="extension() === 'md' ? '# Título\n\nEscribe aquí en Markdown…' : 'Escribe aquí…'"></textarea>
        </label>
        <label class="campo">
          <span>Etiquetas (opcional, separadas por comas)</span>
          <input name="etiquetas" [(ngModel)]="etiquetas" placeholder="p. ej. acta, comite, 2026" />
        </label>
        @if (error()) {
          <div class="alerta alerta-error">{{ error() }}</div>
        }
        <div class="dialogo-acciones">
          <button class="boton" type="button" (click)="cancelar.emit()" [disabled]="ocupado()">Cancelar</button>
          <button class="boton boton-primario" type="submit" [disabled]="ocupado() || !nombre().trim()">
            {{ ocupado() ? 'Creando…' : 'Crear archivo' }}
          </button>
        </div>
      </form>
    </div>
  `,
  styles: `
    .dialogo-ancho { max-width: 680px; }
    .nombre-archivo { display: grid; grid-template-columns: 1fr auto; gap: 10px; }
    textarea { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.88rem; resize: vertical; }
  `,
})
export class DialogoNuevoArchivo implements OnInit {
  readonly ocupado = input(false);
  readonly error = input<string | null>(null);
  readonly crear = output<NuevoArchivo>();
  readonly cancelar = output<void>();

  readonly nombre = signal('');
  readonly extension = signal<'md' | 'txt'>('md');
  readonly contenido = signal('');
  readonly etiquetas = signal('');
  private readonly campo = viewChild<ElementRef<HTMLInputElement>>('campo');

  ngOnInit() {
    setTimeout(() => this.campo()?.nativeElement.focus());
  }

  enviar() {
    // Si el usuario ya escribio la extension ("acta.md"), no se duplica.
    let nombre = this.nombre().trim();
    const sufijo = `.${this.extension()}`;
    if (!nombre) return;
    if (!nombre.toLowerCase().endsWith(sufijo)) nombre += sufijo;
    this.crear.emit({ nombre, contenido: this.contenido(), etiquetas: this.etiquetas().trim() });
  }
}
