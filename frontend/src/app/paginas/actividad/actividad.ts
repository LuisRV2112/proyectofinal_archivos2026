import { DatePipe } from '@angular/common';
import { Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Autenticacion } from '../../nucleo/autenticacion';
import { mensajeDeError } from '../../nucleo/errores';
import { AccionPipe } from '../../nucleo/formato';
import { ACCIONES, Paginado, Usuario } from '../../nucleo/modelos';
import { ActividadApi, EntradaConUsuario } from '../../servicios/actividad';
import { UsuariosApi } from '../../servicios/usuarios';

const LIMITE = 25;

/**
 * Historial de actividad. La misma pantalla sirve para:
 * - /actividad: el historial PROPIO (cualquier usuario).
 * - /admin/actividad: el historial GLOBAL, con filtro por usuario (solo admin;
 *   la ruta trae `data: { global: true }`, que llega como input).
 *
 * El historial es una coleccion aparte (`actividad`) y no un array embebido en
 * el usuario: crece sin limite y se consulta por usuario, accion o fecha con
 * sus propios indices. `recursoNombre` esta denormalizado, por eso las filas
 * siguen siendo legibles aunque el recurso se haya eliminado definitivamente.
 */
@Component({
  selector: 'app-actividad',
  imports: [FormsModule, DatePipe, AccionPipe],
  templateUrl: './actividad.html',
  styles: `
    .filtros { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px;
      align-items: end; padding: 16px; margin-bottom: 16px; background: var(--superficie);
      border: 1px solid var(--borde); border-radius: 8px; }
    .descripcion { margin: -8px 0 16px; }
    .enlace { background: none; border: none; padding: 0; font: inherit; color: var(--primario); cursor: pointer; }
    .fallido { color: var(--peligro); }
    .paginacion { display: flex; gap: 10px; align-items: center; justify-content: flex-end; margin-top: 12px; }
  `,
})
export class ActividadPagina implements OnInit {
  private readonly api = inject(ActividadApi);
  private readonly usuariosApi = inject(UsuariosApi);
  private readonly sesion = inject(Autenticacion).sesion;

  /** true en /admin/actividad (data de la ruta). */
  readonly global = input(false);

  readonly acciones = ACCIONES;
  readonly usuarios = signal<Usuario[]>([]);

  readonly usuarioId = signal('');
  readonly accion = signal('');
  readonly recursoTipo = signal('');
  readonly desde = signal('');
  readonly hasta = signal('');

  readonly resultado = signal<Paginado<EntradaConUsuario> | null>(null);
  readonly pagina = signal(1);
  readonly cargando = signal(false);
  readonly error = signal<string | null>(null);

  readonly totalPaginas = computed(() => {
    const r = this.resultado();
    return r ? Math.max(1, Math.ceil(r.total / r.limite)) : 1;
  });

  ngOnInit() {
    if (this.global()) this.usuariosApi.listar().subscribe({ next: (u) => this.usuarios.set(u) });
    this.buscar();
  }

  buscar(pagina = 1) {
    this.cargando.set(true);
    this.error.set(null);
    this.api
      .listar({
        // En "mi actividad" se pide explicitamente el propio: un administrador
        // sin usuarioId recibiria el historial de todos.
        usuarioId: this.global() ? this.usuarioId() : this.sesion()?.id,
        accion: this.accion(),
        recursoTipo: this.recursoTipo(),
        desde: this.desde(),
        hasta: this.hasta(),
        pagina,
        limite: LIMITE,
      })
      .subscribe({
        next: (r) => {
          this.resultado.set(r);
          this.pagina.set(pagina);
          this.cargando.set(false);
        },
        error: (e) => {
          this.error.set(mensajeDeError(e));
          this.cargando.set(false);
        },
      });
  }

  /** Clic en el usuario de una fila: filtra el historial global por el. */
  filtrarPorUsuario(id: string) {
    this.usuarioId.set(id);
    this.buscar();
  }

  limpiar() {
    this.usuarioId.set('');
    this.accion.set('');
    this.recursoTipo.set('');
    this.desde.set('');
    this.hasta.set('');
    this.buscar();
  }
}
