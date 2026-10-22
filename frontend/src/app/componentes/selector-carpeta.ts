import { Component, inject, input, OnInit, output, signal } from '@angular/core';
import { mensajeDeError } from '../nucleo/errores';
import { Carpeta, Miga } from '../nucleo/modelos';
import { Documentos } from '../servicios/documentos';

/**
 * Elige una carpeta destino recorriendo el arbol del usuario nivel por nivel
 * (para mover, o para acotar una busqueda). Cada nivel se pide a la API al
 * entrar, igual que en el explorador, en vez de cargar todo el arbol.
 *
 * `excluirId`: la carpeta que se esta moviendo no se puede abrir ni elegir
 * (no se puede mover dentro de si misma). La regla completa contra ciclos la
 * aplica la API con `ancestros`; esto solo evita ofrecer lo que se sabe invalido.
 */
@Component({
  selector: 'app-selector-carpeta',
  template: `
    <div class="fondo-dialogo" (click)="cancelar.emit()">
      <div class="dialogo" role="dialog" aria-modal="true" (click)="$event.stopPropagation()">
        <h2>{{ titulo() }}</h2>

        <div class="migas">
          <button type="button" class="enlace" (click)="abrir(null)">Mis documentos</button>
          @for (miga of migas(); track miga._id) {
            <span>/</span>
            <button type="button" class="enlace" (click)="abrir(miga._id)">{{ miga.nombre }}</button>
          }
        </div>

        <div class="lista">
          @if (cargando()) {
            <p class="secundario">Cargando…</p>
          } @else {
            @for (carpeta of carpetas(); track carpeta._id) {
              <button type="button" class="fila" [disabled]="carpeta._id === excluirId()" (click)="abrir(carpeta._id)">
                📁 {{ carpeta.nombre }}
                @if (carpeta._id === excluirId()) {
                  <small class="secundario">(la que se mueve)</small>
                }
              </button>
            } @empty {
              <p class="secundario">Sin subcarpetas</p>
            }
          }
        </div>

        @if (error() || errorExterno()) {
          <div class="alerta alerta-error">{{ error() || errorExterno() }}</div>
        }

        <div class="dialogo-acciones">
          <span class="secundario destino">Destino: {{ actualRuta() }}</span>
          <button class="boton" type="button" (click)="cancelar.emit()" [disabled]="ocupado()">Cancelar</button>
          <button class="boton boton-primario" type="button" (click)="elegir.emit(actualId())"
            [disabled]="cargando() || ocupado()">
            {{ ocupado() ? 'Procesando…' : textoBoton() }}
          </button>
        </div>
      </div>
    </div>
  `,
  styles: `
    .migas { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
    .enlace { background: none; border: none; padding: 0; color: var(--primario); cursor: pointer; font: inherit; }
    .lista { display: flex; flex-direction: column; border: 1px solid var(--borde); border-radius: 6px;
      min-height: 160px; max-height: 300px; overflow-y: auto; padding: 4px; }
    .fila { text-align: left; background: none; border: none; padding: 8px; border-radius: 4px; cursor: pointer; font: inherit; color: inherit; }
    .fila:hover:not(:disabled) { background: var(--fondo); }
    .fila:disabled { cursor: default; opacity: 0.55; }
    .destino { margin-right: auto; align-self: center; font-size: 0.85rem; }
  `,
})
export class SelectorCarpeta implements OnInit {
  private readonly documentos = inject(Documentos);

  readonly titulo = input('Elegir carpeta');
  readonly textoBoton = input('Elegir');
  readonly excluirId = input<string | null>(null);
  readonly ocupado = input(false);
  readonly errorExterno = input<string | null>(null, { alias: 'error' });
  /** null = la raiz. */
  readonly elegir = output<string | null>();
  readonly cancelar = output<void>();

  readonly actualId = signal<string | null>(null);
  readonly actualRuta = signal('/');
  readonly migas = signal<Miga[]>([]);
  readonly carpetas = signal<Carpeta[]>([]);
  readonly cargando = signal(false);
  readonly error = signal<string | null>(null);

  ngOnInit() {
    this.abrir(null);
  }

  abrir(id: string | null) {
    this.cargando.set(true);
    this.error.set(null);
    this.documentos.contenido(id).subscribe({
      next: (contenido) => {
        this.actualId.set(id);
        this.actualRuta.set(contenido.carpeta?.ruta ?? '/');
        this.migas.set(contenido.migas);
        this.carpetas.set(contenido.carpetas);
        this.cargando.set(false);
      },
      error: (e) => {
        this.error.set(mensajeDeError(e));
        this.cargando.set(false);
      },
    });
  }
}
