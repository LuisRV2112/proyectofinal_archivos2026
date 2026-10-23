import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import { AccionPipe } from '../../nucleo/formato';
import { HistorialUsuario, OperacionesPorPeriodo, OperacionesPorTipo, PrincipalesAcciones } from '../../servicios/reportes';

/** Tablas de los reportes de ACTIVIDAD (9 a 12). */

/** Reporte 9 — Historial de un usuario en un rango (paginado). */
@Component({
  selector: 'app-tabla-historial',
  imports: [DatePipe, AccionPipe],
  template: `
    <p class="secundario">{{ datos().usuario.nombreCompleto }}: {{ datos().total }} operación(es) en el rango</p>
    @if (datos().resumen.length) {
      <div class="chips resumen">
        @for (r of datos().resumen; track r.accion) {
          <span class="chip">{{ r.accion | accion }}: {{ r.cantidad }}</span>
        }
      </div>
    }
    <table class="tabla">
      <thead>
        <tr>
          <th>Fecha</th>
          <th>Acción</th>
          <th>Recurso</th>
          <th>Detalle</th>
        </tr>
      </thead>
      <tbody>
        @for (e of datos().resultados; track e._id) {
          <tr>
            <td>{{ e.fecha | date: 'dd/MM/yyyy HH:mm' }}</td>
            <td>{{ e.accion | accion }}</td>
            <td>{{ e.recursoNombre }} <span class="secundario">({{ e.recursoTipo.toLowerCase() }})</span></td>
            <td class="secundario">{{ e.detalle }}</td>
          </tr>
        } @empty {
          <tr><td colspan="4" class="secundario">Sin actividad en ese rango.</td></tr>
        }
      </tbody>
    </table>
  `,
  styles: `.resumen { margin-bottom: 12px; }`,
})
export class TablaHistorial {
  readonly datos = input.required<HistorialUsuario>();
}

/** Reporte 10 — Operaciones agrupadas por tipo. */
@Component({
  selector: 'app-tabla-operaciones-por-tipo',
  imports: [DecimalPipe, AccionPipe],
  template: `
    <p class="secundario">{{ datos().total }} operación(es) en total</p>
    <table class="tabla">
      <thead>
        <tr>
          <th>Acción</th>
          <th class="numero">Cantidad</th>
          <th></th>
          <th class="numero">%</th>
          <th>Por tipo de recurso</th>
        </tr>
      </thead>
      <tbody>
        @for (a of datos().acciones; track a.accion) {
          <tr>
            <td>{{ a.accion | accion }}</td>
            <td class="numero">{{ a.cantidad }}</td>
            <td><div class="medidor"><span [style.width.%]="a.porcentaje"></span></div></td>
            <td class="numero">{{ a.porcentaje | number: '1.0-1' }} %</td>
            <td>
              <div class="chips">
                @for (r of a.porRecurso; track r.recursoTipo) {
                  <span class="chip">{{ r.recursoTipo.toLowerCase() }}: {{ r.cantidad }}</span>
                }
              </div>
            </td>
          </tr>
        } @empty {
          <tr><td colspan="5" class="secundario">Sin operaciones.</td></tr>
        }
      </tbody>
    </table>
  `,
})
export class TablaOperacionesPorTipo {
  readonly datos = input.required<OperacionesPorTipo>();
}

/** Reporte 11 — Operaciones por periodo ($dateTrunc + $densify). */
@Component({
  selector: 'app-tabla-operaciones-por-periodo',
  imports: [AccionPipe],
  template: `
    <p class="secundario">
      {{ datos().total }} operación(es) · {{ datos().periodos.length }} período(s) · zona horaria {{ datos().zonaHoraria }}
    </p>
    <table class="tabla">
      <thead>
        <tr>
          <th>Período</th>
          <th class="numero">Cantidad</th>
          <th class="grafico"></th>
          <th>Principales acciones</th>
        </tr>
      </thead>
      <tbody>
        @for (p of datos().periodos; track p.inicio) {
          <tr>
            <td>{{ p.etiqueta }}</td>
            <td class="numero">{{ p.cantidad }}</td>
            <td><div class="medidor"><span [style.width.%]="(p.cantidad / maximo()) * 100"></span></div></td>
            <td>
              @if (p.cantidad === 0) {
                <span class="secundario">Sin actividad (período rellenado con $densify)</span>
              } @else {
                <div class="chips">
                  @for (a of p.porAccion.slice(0, 4); track a.accion) {
                    <span class="chip">{{ a.accion | accion }}: {{ a.cantidad }}</span>
                  }
                  @if (p.porAccion.length > 4) {
                    <span class="secundario">+{{ p.porAccion.length - 4 }} más</span>
                  }
                </div>
              }
            </td>
          </tr>
        } @empty {
          <tr><td colspan="4" class="secundario">Sin operaciones.</td></tr>
        }
      </tbody>
    </table>
  `,
  styles: `.grafico { width: 30%; }`,
})
export class TablaOperacionesPorPeriodo {
  readonly datos = input.required<OperacionesPorPeriodo>();
  readonly maximo = computed(() => Math.max(1, ...this.datos().periodos.map((p) => p.cantidad)));
}

/** Reporte 12 — Principales acciones, con quienes mas las realizan. */
@Component({
  selector: 'app-tabla-principales-acciones',
  imports: [DatePipe, AccionPipe],
  template: `
    <table class="tabla">
      <thead>
        <tr>
          <th class="numero">#</th>
          <th>Acción</th>
          <th class="numero">Cantidad</th>
          <th class="numero">Usuarios distintos</th>
          <th>Quiénes más la realizan</th>
          <th>Última</th>
        </tr>
      </thead>
      <tbody>
        @for (a of datos(); track a.accion) {
          <tr>
            <td class="numero">{{ a.posicion }}</td>
            <td>{{ a.accion | accion }}</td>
            <td class="numero">{{ a.cantidad }}</td>
            <td class="numero">{{ a.usuariosDistintos }}</td>
            <td>
              <div class="chips">
                @for (q of a.quienesMas; track $index) {
                  <span class="chip" [title]="q.usuario?.nombreCompleto ?? ''">
                    {{ q.usuario?.username ?? '(usuario inexistente)' }}: {{ q.cantidad }}
                  </span>
                }
              </div>
            </td>
            <td>{{ a.ultima | date: 'dd/MM/yyyy HH:mm' }}</td>
          </tr>
        } @empty {
          <tr><td colspan="6" class="secundario">Sin operaciones.</td></tr>
        }
      </tbody>
    </table>
  `,
})
export class TablaPrincipalesAcciones {
  readonly datos = input.required<PrincipalesAcciones>();
}
