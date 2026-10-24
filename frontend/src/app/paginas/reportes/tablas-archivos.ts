import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import { AccionPipe, BytesPipe } from '../../nucleo/formato';
import { ArchivosMasOperaciones, ArchivosPorFecha, ArchivosPorTipo, CarpetasMasArchivos } from '../../servicios/reportes';

/**
 * Tablas de los reportes de ARCHIVOS Y ALMACENAMIENTO (1 a 3, y 14). Cada una
 * recibe la respuesta tal cual la entrega la API en el input `datos`.
 */

/** Reporte 1 — Cantidad de archivos por tipo. */
@Component({
  selector: 'app-tabla-archivos-por-tipo',
  imports: [BytesPipe, DecimalPipe],
  template: `
    <p class="secundario">{{ datos().total }} archivo(s) en total</p>
    <table class="tabla">
      <thead>
        <tr>
          <th>Tipo</th>
          <th class="numero">Cantidad</th>
          <th></th>
          <th class="numero">%</th>
          <th class="numero">Activos</th>
          <th class="numero">En papelera</th>
          <th class="numero">Ocupan</th>
          <th class="numero">Tamaño promedio</th>
        </tr>
      </thead>
      <tbody>
        @for (t of datos().tipos; track t.extension) {
          <tr>
            <td>.{{ t.extension }}</td>
            <td class="numero">{{ t.cantidad }}</td>
            <td><div class="medidor"><span [style.width.%]="t.porcentaje"></span></div></td>
            <td class="numero">{{ t.porcentaje | number: '1.0-1' }} %</td>
            <td class="numero">{{ t.activos }}</td>
            <td class="numero">{{ t.enPapelera }}</td>
            <td class="numero">{{ t.bytes | bytes }}</td>
            <td class="numero">{{ t.tamanoPromedio | bytes }}</td>
          </tr>
        } @empty {
          <tr><td colspan="8" class="secundario">No hay archivos.</td></tr>
        }
      </tbody>
    </table>
  `,
})
export class TablaArchivosPorTipo {
  readonly datos = input.required<ArchivosPorTipo>();
}

/** Reporte 2 — Archivos almacenados en un rango de fechas (paginado). */
@Component({
  selector: 'app-tabla-archivos-por-fecha',
  imports: [BytesPipe, DatePipe],
  template: `
    <p class="secundario">{{ datos().total }} archivo(s) subido(s) en el rango</p>
    <table class="tabla">
      <thead>
        <tr>
          <th>Nombre</th>
          <th>Propietario</th>
          <th>Ubicación</th>
          <th class="numero">Tamaño</th>
          <th>Subido</th>
        </tr>
      </thead>
      <tbody>
        @for (a of datos().resultados; track a._id) {
          <tr>
            <td>
              📄 {{ a.nombre }}
              @if (a.enPapelera) {
                <span class="chip">en papelera</span>
              }
            </td>
            <td>{{ a.propietario?.username ?? '—' }}</td>
            <td>{{ a.ubicacion }}</td>
            <td class="numero">{{ a.tamano | bytes }}</td>
            <td>{{ a.creadoEn | date: 'dd/MM/yyyy HH:mm' }}</td>
          </tr>
        } @empty {
          <tr><td colspan="5" class="secundario">No se subió ningún archivo en ese rango.</td></tr>
        }
      </tbody>
    </table>
  `,
})
export class TablaArchivosPorFecha {
  readonly datos = input.required<ArchivosPorFecha>();
}

/** Reporte 3 — Archivos con mas operaciones registradas. */
@Component({
  selector: 'app-tabla-archivos-mas-operaciones',
  imports: [DatePipe, AccionPipe],
  template: `
    <table class="tabla">
      <thead>
        <tr>
          <th>Archivo</th>
          <th>Propietario</th>
          <th class="numero">Operaciones</th>
          <th></th>
          <th>Desglose</th>
          <th>Última</th>
        </tr>
      </thead>
      <tbody>
        @for (a of datos(); track a.archivoId) {
          <tr>
            <td>
              📄 {{ a.nombre }}
              @if (!a.existe) {
                <span class="chip" title="El nombre sale del historial (recursoNombre denormalizado)">eliminado definitivamente</span>
              } @else if (a.enPapelera) {
                <span class="chip">en papelera</span>
              }
            </td>
            <td>{{ a.propietario?.username ?? '—' }}</td>
            <td class="numero">{{ a.operaciones }}</td>
            <td><div class="medidor"><span [style.width.%]="(a.operaciones / maximo()) * 100"></span></div></td>
            <td>
              <div class="chips">
                @for (p of a.porAccion; track p.accion) {
                  <span class="chip">{{ p.accion | accion }}: {{ p.cantidad }}</span>
                }
              </div>
            </td>
            <td>{{ a.ultimaOperacion | date: 'dd/MM/yyyy HH:mm' }}</td>
          </tr>
        } @empty {
          <tr><td colspan="6" class="secundario">No hay operaciones sobre archivos.</td></tr>
        }
      </tbody>
    </table>
  `,
})
export class TablaArchivosMasOperaciones {
  readonly datos = input.required<ArchivosMasOperaciones>();
  // La barra es relativa al primero del ranking (ya viene ordenado).
  readonly maximo = computed(() => this.datos()[0]?.operaciones || 1);
}

/**
 * Reporte 14 — Carpetas con mas archivos. Muestra los dos conteos (directos y
 * subarbol) aunque se ordene por uno: la diferencia entre ambos es lo que
 * hay en sus subcarpetas.
 */
@Component({
  selector: 'app-tabla-carpetas-mas-archivos',
  imports: [BytesPipe],
  template: `
    <table class="tabla">
      <thead>
        <tr>
          <th class="numero">#</th>
          <th>Carpeta</th>
          <th>Propietario</th>
          <th class="numero">Archivos directos</th>
          <th class="numero">En todo el subárbol</th>
          <th class="numero">Ocupan (subárbol)</th>
        </tr>
      </thead>
      <tbody>
        @for (c of datos(); track c._id; let i = $index) {
          <tr>
            <td class="numero">{{ i + 1 }}</td>
            <td>
              📁 {{ c.nombre }}
              <div class="secundario ubicacion">{{ c.ruta }} · nivel {{ c.nivel }}</div>
            </td>
            <td>{{ c.propietario?.username ?? '—' }}</td>
            <td class="numero">{{ c.archivosDirectos }}</td>
            <td class="numero">{{ c.archivosSubarbol }}</td>
            <td class="numero">{{ c.bytesSubarbol | bytes }}</td>
          </tr>
        } @empty {
          <tr><td colspan="6" class="secundario">No hay carpetas con archivos.</td></tr>
        }
      </tbody>
    </table>
  `,
  styles: `.ubicacion { font-size: 0.82rem; }`,
})
export class TablaCarpetasMasArchivos {
  readonly datos = input.required<CarpetasMasArchivos>();
}
