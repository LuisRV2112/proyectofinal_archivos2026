import { DatePipe } from '@angular/common';
import { Component, input } from '@angular/core';
import { BytesPipe } from '../../nucleo/formato';
import { CompartidosPorUsuario, NuncaCompartidos, RecibidosPorUsuario, RecursosMasCompartidos } from '../../servicios/reportes';

/**
 * Tablas de los reportes de COMPARTICION (6 a 8, y 13). Mezclan carpetas y
 * archivos: el backend une ambas colecciones con $unionWith.
 */

/** Reporte 6 — Recursos compartidos con mas usuarios. */
@Component({
  selector: 'app-tabla-recursos-mas-compartidos',
  template: `
    <table class="tabla">
      <thead>
        <tr>
          <th>Recurso</th>
          <th>Propietario</th>
          <th class="numero">Usuarios</th>
          <th>Compartido con</th>
        </tr>
      </thead>
      <tbody>
        @for (r of datos(); track r._id) {
          <tr>
            <td>
              {{ r.tipo === 'CARPETA' ? '📁' : '📄' }} {{ r.nombre }}
              <div class="secundario ubicacion">{{ r.ubicacion }}</div>
            </td>
            <td>{{ r.propietario?.username ?? '—' }}</td>
            <td class="numero">{{ r.usuarios }}</td>
            <td>
              <div class="chips">
                @for (p of r.compartidoCon; track p.usuario.username) {
                  <span class="chip" [title]="p.usuario.nombreCompleto">{{ p.usuario.username }} · {{ p.nivel }}</span>
                }
              </div>
            </td>
          </tr>
        } @empty {
          <tr><td colspan="4" class="secundario">No hay recursos compartidos.</td></tr>
        }
      </tbody>
    </table>
  `,
  styles: `.ubicacion { font-size: 0.82rem; }`,
})
export class TablaRecursosMasCompartidos {
  readonly datos = input.required<RecursosMasCompartidos>();
}

/** Reporte 7 — Recursos compartidos POR un usuario (paginado). */
@Component({
  selector: 'app-tabla-compartidos-por',
  imports: [DatePipe],
  template: `
    <p class="secundario">{{ datos().usuario.nombreCompleto }} ha compartido {{ datos().total }} recurso(s)</p>
    <table class="tabla">
      <thead>
        <tr>
          <th>Recurso</th>
          <th class="numero">Usuarios</th>
          <th>Con quién y desde cuándo</th>
        </tr>
      </thead>
      <tbody>
        @for (r of datos().resultados; track r._id) {
          <tr>
            <td>
              {{ r.tipo === 'CARPETA' ? '📁' : '📄' }} {{ r.nombre }}
              <div class="secundario ubicacion">{{ r.ubicacion }}</div>
            </td>
            <td class="numero">{{ r.usuarios }}</td>
            <td>
              <div class="chips">
                @for (p of r.compartidoCon; track p.usuario.username) {
                  <span class="chip" [title]="p.usuario.nombreCompleto">
                    {{ p.usuario.username }} · {{ p.nivel }} · {{ p.otorgadoEn | date: 'dd/MM/yyyy' }}
                  </span>
                }
              </div>
            </td>
          </tr>
        } @empty {
          <tr><td colspan="3" class="secundario">Este usuario no ha compartido ningún recurso.</td></tr>
        }
      </tbody>
    </table>
  `,
  styles: `.ubicacion { font-size: 0.82rem; }`,
})
export class TablaCompartidosPor {
  readonly datos = input.required<CompartidosPorUsuario>();
}

/** Reporte 8 — Recursos RECIBIDOS por un usuario (paginado). */
@Component({
  selector: 'app-tabla-recibidos',
  imports: [DatePipe],
  template: `
    <p class="secundario">
      {{ datos().usuario.nombreCompleto }} ha recibido {{ datos().total }} recurso(s) de forma directa. Lo que hay dentro
      de una carpeta recibida también es accesible (herencia), pero no se lista aparte.
    </p>
    <table class="tabla">
      <thead>
        <tr>
          <th>Recurso</th>
          <th>Propietario</th>
          <th>Nivel</th>
          <th>Otorgado por</th>
          <th>Recibido</th>
        </tr>
      </thead>
      <tbody>
        @for (r of datos().resultados; track r._id) {
          <tr>
            <td>
              {{ r.tipo === 'CARPETA' ? '📁' : '📄' }} {{ r.nombre }}
              <div class="secundario ubicacion">{{ r.ubicacion }}</div>
            </td>
            <td>{{ r.propietario?.username ?? '—' }}</td>
            <td>{{ r.nivel }}</td>
            <td>{{ r.otorgadoPor?.username ?? '—' }}</td>
            <td>{{ r.recibidoEn | date: 'dd/MM/yyyy HH:mm' }}</td>
          </tr>
        } @empty {
          <tr><td colspan="5" class="secundario">Este usuario no ha recibido recursos.</td></tr>
        }
      </tbody>
    </table>
  `,
  styles: `.ubicacion { font-size: 0.82rem; }`,
})
export class TablaRecibidos {
  readonly datos = input.required<RecibidosPorUsuario>();
}

/** Reporte 13 — Archivos que nunca han sido compartidos (paginado). */
@Component({
  selector: 'app-tabla-nunca-compartidos',
  imports: [BytesPipe, DatePipe],
  template: `
    <p class="secundario">{{ datos().total }} archivo(s) que nadie más ha podido ver</p>
    <table class="tabla">
      <thead>
        <tr>
          <th>Archivo</th>
          <th>Propietario</th>
          <th class="numero">Tamaño</th>
          <th>Creado</th>
        </tr>
      </thead>
      <tbody>
        @for (a of datos().resultados; track a._id) {
          <tr>
            <td>
              📄 {{ a.nombre }}
              <div class="secundario ubicacion">{{ a.ubicacion }}</div>
            </td>
            <td>{{ a.propietario?.username ?? '—' }}</td>
            <td class="numero">{{ a.tamano | bytes }}</td>
            <td>{{ a.creadoEn | date: 'dd/MM/yyyy' }}</td>
          </tr>
        } @empty {
          <tr><td colspan="4" class="secundario">Todos los archivos se han compartido alguna vez.</td></tr>
        }
      </tbody>
    </table>
  `,
  styles: `.ubicacion { font-size: 0.82rem; }`,
})
export class TablaNuncaCompartidos {
  readonly datos = input.required<NuncaCompartidos>();
}
