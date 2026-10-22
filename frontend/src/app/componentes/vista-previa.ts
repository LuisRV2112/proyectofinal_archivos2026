import { Component, computed, inject, input, OnInit, output, signal } from '@angular/core';
import { marked } from 'marked';
import { BytesPipe } from '../nucleo/formato';
import { mensajeDeError } from '../nucleo/errores';
import { Archivo } from '../nucleo/modelos';
import { Documentos } from '../servicios/documentos';

/**
 * Vista previa de un .txt o .md dentro de la aplicacion. El contenido sale de
 * GridFS a traves de GET /api/archivos/:id/contenido; los metadatos ya
 * estaban en el listado (por eso se separan: listar no lee el contenido).
 *
 * Un .md se muestra formateado. El HTML que genera `marked` pasa por
 * [innerHTML], que Angular SANITIZA: un <script> o un onclick escrito dentro
 * del markdown se descarta y no se ejecuta.
 */
@Component({
  selector: 'app-vista-previa',
  imports: [BytesPipe],
  template: `
    <div class="fondo-dialogo" (click)="cerrar.emit()">
      <div class="dialogo previa" role="dialog" aria-modal="true" (click)="$event.stopPropagation()">
        <div class="encabezado">
          <div>
            <h2>{{ archivo().nombre }}</h2>
            <span class="secundario">{{ archivo().extension.toUpperCase() }} · {{ archivo().tamano | bytes }}</span>
          </div>
          @if (archivo().extension === 'md') {
            <button class="boton boton-chico" type="button" (click)="formateado.set(!formateado())">
              {{ formateado() ? 'Ver texto' : 'Ver formateado' }}
            </button>
          }
        </div>

        <div class="cuerpo">
          @if (cargando()) {
            <p class="secundario">Cargando contenido…</p>
          } @else if (error()) {
            <div class="alerta alerta-error">{{ error() }}</div>
          } @else if (html()) {
            <div class="markdown" [innerHTML]="html()"></div>
          } @else {
            <pre>{{ texto() }}</pre>
          }
        </div>

        <div class="dialogo-acciones">
          <button class="boton" type="button" (click)="descargar()" [disabled]="descargando()">
            {{ descargando() ? 'Descargando…' : 'Descargar' }}
          </button>
          <button class="boton boton-primario" type="button" (click)="cerrar.emit()">Cerrar</button>
        </div>
      </div>
    </div>
  `,
  styles: `
    .previa { max-width: 860px; }
    .encabezado { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
    .encabezado h2 { margin: 0 0 2px; word-break: break-all; }
    .cuerpo { border: 1px solid var(--borde); border-radius: 6px; padding: 14px 18px; max-height: 60vh; overflow: auto; background: var(--fondo); }
    pre { margin: 0; white-space: pre-wrap; word-break: break-word; font-size: 0.9rem; }
    .markdown { line-height: 1.55; }
    .markdown :is(h1, h2, h3) { margin: 0.8em 0 0.4em; }
    .markdown table { border-collapse: collapse; }
    .markdown :is(th, td) { border: 1px solid var(--borde); padding: 4px 8px; }
    .markdown code { background: var(--superficie); padding: 1px 4px; border-radius: 3px; }
  `,
})
export class VistaPrevia implements OnInit {
  private readonly documentos = inject(Documentos);

  readonly archivo = input.required<Archivo>();
  readonly cerrar = output<void>();

  readonly texto = signal('');
  readonly cargando = signal(true);
  readonly descargando = signal(false);
  readonly error = signal<string | null>(null);
  readonly formateado = signal(true);
  readonly html = computed(() =>
    this.archivo().extension === 'md' && this.formateado() ? (marked.parse(this.texto(), { async: false }) as string) : null,
  );

  ngOnInit() {
    this.documentos.texto(this.archivo()._id).subscribe({
      next: (texto) => {
        this.texto.set(texto);
        this.cargando.set(false);
      },
      error: (e) => {
        this.error.set(mensajeDeError(e));
        this.cargando.set(false);
      },
    });
  }

  descargar() {
    this.descargando.set(true);
    this.documentos.descargar(this.archivo()).subscribe({
      next: () => this.descargando.set(false),
      error: (e) => {
        this.error.set(mensajeDeError(e));
        this.descargando.set(false);
      },
    });
  }
}
