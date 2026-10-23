import { DatePipe } from '@angular/common';
import { Component, computed, inject, input, OnInit, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Avisos } from '../nucleo/avisos';
import { mensajeDeError } from '../nucleo/errores';
import { Nivel, PermisoDetallado, RecursoCompartible, UsuarioResumen } from '../nucleo/modelos';
import { Comparticion } from '../servicios/comparticion';

export const NIVELES: { valor: Nivel; texto: string }[] = [
  { valor: 'LECTURA', texto: 'Lectura' },
  { valor: 'COMENTARIO', texto: 'Comentario' },
  { valor: 'EDICION', texto: 'Edición' },
];

/**
 * Gestion de permisos de un recurso: con quien esta compartido, agregar a
 * alguien, cambiar su nivel o revocarlo. Solo lo abre el propietario (o un
 * administrador); la API lo exige igual.
 *
 * Compartir una CARPETA da acceso a todo su contenido (herencia hacia abajo,
 * regla 5.2): el dialogo lo recuerda para que no sorprenda.
 */
@Component({
  selector: 'app-dialogo-compartir',
  imports: [FormsModule, DatePipe],
  template: `
    <div class="fondo-dialogo" (click)="cerrar.emit()">
      <div class="dialogo ancho" role="dialog" aria-modal="true" (click)="$event.stopPropagation()">
        <h2>Compartir «{{ recurso().nombre }}»</h2>
        @if (recurso().tipo === 'carpeta') {
          <p class="secundario nota">Quien reciba la carpeta podrá acceder también a todo su contenido, con el mismo nivel.</p>
        }

        <form class="agregar" (ngSubmit)="agregar()">
          <select name="usuario" [ngModel]="usuarioNuevo()" (ngModelChange)="usuarioNuevo.set($event)" aria-label="Usuario">
            <option value="">Elegir usuario…</option>
            @for (u of disponibles(); track u._id) {
              <option [value]="u._id">{{ u.nombreCompleto }} ({{ u.username }})</option>
            }
          </select>
          <select name="nivel" [ngModel]="nivelNuevo()" (ngModelChange)="nivelNuevo.set($event)" aria-label="Nivel">
            @for (n of niveles; track n.valor) {
              <option [value]="n.valor">{{ n.texto }}</option>
            }
          </select>
          <button class="boton boton-primario" type="submit" [disabled]="!usuarioNuevo() || ocupado()">Compartir</button>
        </form>

        @if (error()) {
          <div class="alerta alerta-error">{{ error() }}</div>
        }

        <h3>Con acceso</h3>
        @if (cargando()) {
          <p class="secundario">Cargando…</p>
        } @else {
          <ul class="permisos">
            @for (p of permisos(); track p.usuarioId._id) {
              <li>
                <div class="quien">
                  <strong>{{ p.usuarioId.nombreCompleto }}</strong>
                  <span class="secundario">{{ p.usuarioId.username }} · desde {{ p.otorgadoEn | date: 'dd/MM/yyyy' }}</span>
                </div>
                <select [ngModel]="p.nivel" (ngModelChange)="cambiarNivel(p, $event)" [disabled]="ocupado()" aria-label="Nivel">
                  @for (n of niveles; track n.valor) {
                    <option [value]="n.valor">{{ n.texto }}</option>
                  }
                </select>
                @if (revocando() === p.usuarioId._id) {
                  <span class="confirmar">
                    ¿Quitar acceso?
                    <button class="boton boton-chico boton-peligro" type="button" (click)="revocar(p)" [disabled]="ocupado()">Sí</button>
                    <button class="boton boton-chico" type="button" (click)="revocando.set(null)">No</button>
                  </span>
                } @else {
                  <button class="boton boton-chico" type="button" (click)="revocando.set(p.usuarioId._id)">Revocar</button>
                }
              </li>
            } @empty {
              <li class="secundario">Todavía no está compartido con nadie.</li>
            }
          </ul>
        }

        <div class="dialogo-acciones">
          <button class="boton" type="button" (click)="cerrar.emit()">Cerrar</button>
        </div>
      </div>
    </div>
  `,
  styles: `
    .ancho { max-width: 620px; }
    .nota { margin: -6px 0 0; font-size: 0.9rem; }
    .agregar { display: flex; gap: 8px; flex-wrap: wrap; }
    .agregar select:first-child { flex: 1; min-width: 200px; }
    h3 { margin: 4px 0 0; font-size: 0.95rem; }
    .permisos { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
    .permisos li { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--borde); flex-wrap: wrap; }
    .permisos li:last-child { border-bottom: none; }
    .quien { flex: 1; display: flex; flex-direction: column; min-width: 180px; }
    .quien .secundario { font-size: 0.82rem; }
    .confirmar { display: flex; align-items: center; gap: 4px; font-size: 0.85rem; }
  `,
})
export class DialogoCompartir implements OnInit {
  private readonly comparticion = inject(Comparticion);
  private readonly avisos = inject(Avisos);

  readonly recurso = input.required<RecursoCompartible>();
  /** Se emite tras cada cambio, para que la pantalla de origen se actualice. */
  readonly cambio = output<void>();
  readonly cerrar = output<void>();

  readonly niveles = NIVELES;
  readonly permisos = signal<PermisoDetallado[]>([]);
  readonly usuarios = signal<UsuarioResumen[]>([]);
  readonly usuarioNuevo = signal('');
  readonly nivelNuevo = signal<Nivel>('LECTURA');
  readonly cargando = signal(true);
  readonly ocupado = signal(false);
  readonly error = signal<string | null>(null);
  readonly revocando = signal<string | null>(null);

  /** En el selector, solo quienes aun no tienen acceso directo. */
  readonly disponibles = computed(() => {
    const conAcceso = new Set(this.permisos().map((p) => p.usuarioId._id));
    return this.usuarios().filter((u) => !conAcceso.has(u._id));
  });

  ngOnInit() {
    this.comparticion.destinatarios().subscribe({
      next: (usuarios) => this.usuarios.set(usuarios),
      error: (e) => this.error.set(mensajeDeError(e)),
    });
    this.cargarPermisos();
  }

  private cargarPermisos() {
    this.comparticion.permisos(this.recurso()).subscribe({
      next: (r) => {
        this.permisos.set(r.compartidoCon);
        this.cargando.set(false);
      },
      error: (e) => {
        this.error.set(mensajeDeError(e));
        this.cargando.set(false);
      },
    });
  }

  agregar() {
    const usuario = this.usuarios().find((u) => u._id === this.usuarioNuevo());
    if (!usuario) return;
    this.operar(this.comparticion.compartir(this.recurso(), usuario._id, this.nivelNuevo()), `Compartido con ${usuario.username}`, () =>
      this.usuarioNuevo.set(''),
    );
  }

  cambiarNivel(permiso: PermisoDetallado, nivel: Nivel) {
    this.operar(
      this.comparticion.cambiarNivel(this.recurso(), permiso.usuarioId._id, nivel),
      `${permiso.usuarioId.username} ahora tiene nivel ${nivel}`,
    );
  }

  revocar(permiso: PermisoDetallado) {
    this.operar(this.comparticion.revocar(this.recurso(), permiso.usuarioId._id), `Acceso de ${permiso.usuarioId.username} revocado`, () =>
      this.revocando.set(null),
    );
  }

  private operar(operacion: ReturnType<Comparticion['revocar']>, exito: string, despues?: () => void) {
    this.ocupado.set(true);
    this.error.set(null);
    operacion.subscribe({
      next: () => {
        this.ocupado.set(false);
        despues?.();
        this.avisos.exito(exito);
        this.cambio.emit();
        this.cargarPermisos();
      },
      error: (e) => {
        this.ocupado.set(false);
        this.error.set(mensajeDeError(e));
        // Si fallo un cambio de nivel, el select debe volver al valor real.
        this.cargarPermisos();
      },
    });
  }
}
