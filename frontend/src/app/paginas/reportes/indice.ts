import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Autenticacion } from '../../nucleo/autenticacion';
import { DefinicionReporte, REPORTES } from './catalogo';

/**
 * Indice de reportes, agrupados como en la seccion 7. Cada uno abre su
 * propia vista (/reportes/:clave). Al usuario normal solo se le ofrecen los
 * que puede pedir: la comparticion propia y su historial.
 */
@Component({
  selector: 'app-reportes-indice',
  imports: [RouterLink],
  template: `
    <h1>Reportes</h1>
    @if (!esAdministrador()) {
      <p class="secundario">
        Los reportes de archivos, usuarios y actividad global son del administrador. Aquí ves los de tus propios
        recursos compartidos y tu historial.
      </p>
    }
    @for (grupo of grupos(); track grupo.titulo) {
      <h2>{{ grupo.titulo }}</h2>
      <div class="tarjetas">
        @for (r of grupo.reportes; track r.clave) {
          <a class="tarjeta" [routerLink]="['/reportes', r.clave]">
            <span class="numero-reporte">{{ r.numero }}</span>
            <strong>{{ r.titulo }}</strong>
            <span class="secundario">{{ r.descripcion }}</span>
          </a>
        }
      </div>
    }
  `,
  styles: `
    .tarjetas { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; margin-bottom: 24px; }
    .tarjeta { display: flex; flex-direction: column; gap: 6px; padding: 14px 16px; background: var(--superficie);
      border: 1px solid var(--borde); border-radius: 8px; color: inherit; text-decoration: none; }
    .tarjeta:hover { border-color: var(--primario); }
    .tarjeta .secundario { font-size: 0.86rem; }
    .numero-reporte { align-self: flex-start; font-size: 0.75rem; font-weight: 600; color: var(--primario);
      background: var(--primario-suave); border-radius: 10px; padding: 1px 8px; }
  `,
})
export class ReportesIndice {
  readonly esAdministrador = inject(Autenticacion).esAdministrador;

  readonly grupos = computed(() => {
    const visibles = REPORTES.filter((r) => this.esAdministrador() || !r.soloAdmin);
    const grupos: { titulo: string; reportes: DefinicionReporte[] }[] = [];
    for (const r of visibles) {
      const grupo = grupos.find((g) => g.titulo === r.grupo);
      if (grupo) grupo.reportes.push(r);
      else grupos.push({ titulo: r.grupo, reportes: [r] });
    }
    return grupos;
  });
}
