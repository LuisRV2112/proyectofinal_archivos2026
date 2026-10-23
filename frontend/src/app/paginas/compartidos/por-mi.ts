import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DialogoCompartir } from '../../componentes/dialogo-compartir';
import { mensajeDeError } from '../../nucleo/errores';
import { CompartidoPorMi, RecursoCompartible } from '../../nucleo/modelos';
import { Comparticion } from '../../servicios/comparticion';

/** Recursos propios compartidos con alguien, con la gestion de sus permisos. */
@Component({
  selector: 'app-compartido-por-mi',
  imports: [RouterLink, DialogoCompartir],
  template: `
    <h1>Compartido por mí</h1>
    @if (error()) {
      <div class="alerta alerta-error">{{ error() }}</div>
    } @else if (cargando()) {
      <p class="secundario">Cargando…</p>
    } @else {
      <table class="tabla">
        <thead>
          <tr><th>Nombre</th><th>Compartido con</th><th></th></tr>
        </thead>
        <tbody>
          @for (r of recursos(); track r._id) {
            <tr>
              <td>
                @if (r.tipo === 'CARPETA') {
                  <a [routerLink]="['/explorador', r._id]">📁 {{ r.nombre }}</a>
                  <div class="secundario ruta">{{ r.ruta }}</div>
                } @else {
                  📄 {{ r.nombre }}
                  @if (r.carpetaId) {
                    <div class="ruta"><a [routerLink]="['/explorador', r.carpetaId]">Abrir su carpeta</a></div>
                  }
                }
              </td>
              <td>
                <div class="personas">
                  @for (p of r.compartidoCon; track p.usuarioId._id) {
                    <span class="persona" [title]="p.usuarioId.nombreCompleto">{{ p.usuarioId.username }} · {{ p.nivel }}</span>
                  }
                </div>
              </td>
              <td class="numero">
                <button class="boton boton-chico" type="button" (click)="gestionar(r)">Gestionar</button>
              </td>
            </tr>
          } @empty {
            <tr><td colspan="3" class="secundario">No has compartido ningún recurso.</td></tr>
          }
        </tbody>
      </table>
    }
    @if (gestionando(); as recurso) {
      <app-dialogo-compartir [recurso]="recurso" (cerrar)="gestionando.set(null); cargar()" />
    }
  `,
  styles: `
    .ruta { font-size: 0.82rem; }
    .personas { display: flex; flex-wrap: wrap; gap: 4px; }
    .persona { font-size: 0.78rem; padding: 2px 8px; border-radius: 10px; background: var(--fondo); border: 1px solid var(--borde); }
  `,
})
export class CompartidoPorMiPagina implements OnInit {
  private readonly comparticion = inject(Comparticion);

  readonly recursos = signal<CompartidoPorMi[]>([]);
  readonly cargando = signal(true);
  readonly error = signal<string | null>(null);
  readonly gestionando = signal<RecursoCompartible | null>(null);

  ngOnInit() {
    this.cargar();
  }

  cargar() {
    this.comparticion.porMi().subscribe({
      next: (r) => {
        this.recursos.set(r);
        this.cargando.set(false);
      },
      error: (e) => {
        this.error.set(mensajeDeError(e));
        this.cargando.set(false);
      },
    });
  }

  gestionar(r: CompartidoPorMi) {
    this.gestionando.set({ tipo: r.tipo === 'CARPETA' ? 'carpeta' : 'archivo', _id: r._id, nombre: r.nombre });
  }
}
