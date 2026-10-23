import { Component, input } from '@angular/core';
import { BytesPipe } from '../../nucleo/formato';
import { TopUsuariosArchivos, UsuariosMasCompartidos } from '../../servicios/reportes';

/** Tablas de los reportes de USUARIOS (4 y 5). */

/** Reporte 4 — Top de usuarios por archivos almacenados. */
@Component({
  selector: 'app-tabla-top-usuarios-archivos',
  imports: [BytesPipe],
  template: `
    <table class="tabla">
      <thead>
        <tr>
          <th class="numero">#</th>
          <th>Usuario</th>
          <th class="numero">Archivos</th>
          <th class="numero">.md</th>
          <th class="numero">.txt</th>
          <th class="numero">En papelera</th>
          <th class="numero">Suma de tamaños</th>
          <th class="numero" title="Valor denormalizado en el usuario (Computed Pattern)">almacenamientoUsado</th>
        </tr>
      </thead>
      <tbody>
        @for (u of datos(); track u.usuarioId) {
          <tr>
            <td class="numero">{{ u.posicion }}</td>
            <td>
              {{ u.nombreCompleto }} <span class="secundario">({{ u.username }})</span>
              @if (!u.activo) {
                <span class="chip">desactivado</span>
              }
            </td>
            <td class="numero">{{ u.archivos }}</td>
            <td class="numero">{{ u.porTipo.md }}</td>
            <td class="numero">{{ u.porTipo.txt }}</td>
            <td class="numero">{{ u.enPapelera }}</td>
            <td class="numero">{{ u.bytes | bytes }}</td>
            <td class="numero">{{ u.almacenamientoUsado | bytes }}</td>
          </tr>
        } @empty {
          <tr><td colspan="8" class="secundario">Ningún usuario tiene archivos.</td></tr>
        }
      </tbody>
    </table>
    <p class="secundario nota">
      Con la papelera incluida, la suma de tamaños coincide con <code>almacenamientoUsado</code>: el valor
      denormalizado se mantiene al subir y al eliminar definitivamente.
    </p>
  `,
  styles: `.nota { font-size: 0.85rem; margin-top: 10px; }`,
})
export class TablaTopUsuariosArchivos {
  readonly datos = input.required<TopUsuariosArchivos>();
}

/** Reporte 5 — Usuarios con mas recursos compartidos. */
@Component({
  selector: 'app-tabla-usuarios-mas-compartidos',
  template: `
    <table class="tabla">
      <thead>
        <tr>
          <th>Usuario</th>
          <th class="numero">Recursos compartidos</th>
          <th class="numero">Carpetas</th>
          <th class="numero">Archivos</th>
          <th class="numero">Permisos otorgados</th>
          <th class="numero">Personas distintas</th>
        </tr>
      </thead>
      <tbody>
        @for (u of datos(); track u.usuarioId) {
          <tr>
            <td>{{ u.nombreCompleto }} <span class="secundario">({{ u.username }})</span></td>
            <td class="numero">{{ u.recursos }}</td>
            <td class="numero">{{ u.carpetas }}</td>
            <td class="numero">{{ u.archivos }}</td>
            <td class="numero">{{ u.permisosOtorgados }}</td>
            <td class="numero">{{ u.usuariosDistintos }}</td>
          </tr>
        } @empty {
          <tr><td colspan="6" class="secundario">Nadie ha compartido recursos.</td></tr>
        }
      </tbody>
    </table>
  `,
})
export class TablaUsuariosMasCompartidos {
  readonly datos = input.required<UsuariosMasCompartidos>();
}
