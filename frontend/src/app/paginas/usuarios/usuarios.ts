import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Confirmacion } from '../../componentes/confirmacion';
import { Autenticacion } from '../../nucleo/autenticacion';
import { Avisos } from '../../nucleo/avisos';
import { mensajeDeError } from '../../nucleo/errores';
import { BytesPipe } from '../../nucleo/formato';
import { Usuario } from '../../nucleo/modelos';
import { CambiosUsuario, NuevoUsuario, UsuariosApi } from '../../servicios/usuarios';
import { DialogoUsuario } from './dialogo-usuario';

/**
 * Gestion de usuarios (solo administrador): listar, crear, editar y
 * activar/desactivar. No hay "eliminar usuario": desactivar impide iniciar
 * sesion pero conserva sus documentos y su historial, que son auditoria y
 * siguen contando en los reportes.
 */
@Component({
  selector: 'app-usuarios',
  imports: [FormsModule, DatePipe, BytesPipe, Confirmacion, DialogoUsuario],
  templateUrl: './usuarios.html',
  styles: `
    .acciones { display: flex; gap: 4px; justify-content: flex-end; flex-wrap: wrap; }
    .estado { font-size: 0.78rem; padding: 2px 8px; border-radius: 10px; white-space: nowrap; }
    .activo { background: var(--exito-suave); color: var(--exito); }
    .inactivo { background: var(--peligro-suave); color: var(--peligro); }
    tr.desactivado td:not(:last-child) { color: var(--texto-suave); }
  `,
})
export class UsuariosPagina implements OnInit {
  private readonly api = inject(UsuariosApi);
  private readonly avisos = inject(Avisos);
  private readonly autenticacion = inject(Autenticacion);

  readonly idPropio = computed(() => this.autenticacion.sesion()?.id);

  readonly usuarios = signal<Usuario[]>([]);
  readonly cargando = signal(true);
  readonly error = signal<string | null>(null);

  // Filtros (la API los aplica: ?rol= y ?activo=).
  readonly rol = signal('');
  readonly activo = signal('');

  /** null = cerrado; 'nuevo' = crear; un usuario = editarlo. */
  readonly editando = signal<Usuario | 'nuevo' | null>(null);
  readonly aDesactivar = signal<Usuario | null>(null);
  readonly ocupado = signal(false);
  readonly errorDialogo = signal<string | null>(null);

  ngOnInit() {
    this.cargar();
  }

  cargar() {
    this.cargando.set(true);
    this.api.listar({ rol: this.rol(), activo: this.activo() }).subscribe({
      next: (u) => {
        this.usuarios.set(u);
        this.error.set(null);
        this.cargando.set(false);
      },
      error: (e) => {
        this.error.set(mensajeDeError(e));
        this.cargando.set(false);
      },
    });
  }

  abrir(usuario: Usuario | 'nuevo') {
    this.errorDialogo.set(null);
    this.editando.set(usuario);
  }

  crear(datos: NuevoUsuario) {
    this.ejecutar(this.api.crear(datos), (u) => `Usuario "${u.username}" creado`);
  }

  guardar(usuario: Usuario, cambios: CambiosUsuario) {
    if (!Object.keys(cambios).length) {
      this.editando.set(null);
      this.avisos.info('No hubo cambios');
      return;
    }
    this.ejecutar(this.api.actualizar(usuario._id, cambios), (u) => {
      // Si el admin se edito a si mismo, el nombre del menu se actualiza.
      if (u._id === this.idPropio()) this.autenticacion.refrescarPerfil();
      return `Usuario "${u.username}" actualizado`;
    });
  }

  private ejecutar(peticion: ReturnType<UsuariosApi['crear']>, mensaje: (u: Usuario) => string) {
    this.ocupado.set(true);
    this.errorDialogo.set(null);
    peticion.subscribe({
      next: (u) => {
        this.ocupado.set(false);
        this.editando.set(null);
        this.avisos.exito(mensaje(u));
        this.cargar();
      },
      // Username o correo repetidos (409), validaciones del esquema (400)...
      error: (e) => {
        this.ocupado.set(false);
        this.errorDialogo.set(mensajeDeError(e));
      },
    });
  }

  /** Desactivar pide confirmacion; activar no (no tiene consecuencias que avisar). */
  cambiarEstado(usuario: Usuario) {
    if (usuario.activo) {
      this.errorDialogo.set(null);
      this.aDesactivar.set(usuario);
    } else {
      this.aplicarEstado(usuario, true);
    }
  }

  aplicarEstado(usuario: Usuario, activo: boolean) {
    this.ocupado.set(true);
    this.api.cambiarEstado(usuario._id, activo).subscribe({
      next: (u) => {
        this.ocupado.set(false);
        this.aDesactivar.set(null);
        this.avisos.exito(`Cuenta de "${u.username}" ${activo ? 'activada' : 'desactivada'}`);
        this.cargar();
      },
      error: (e) => {
        this.ocupado.set(false);
        if (this.aDesactivar()) this.errorDialogo.set(mensajeDeError(e));
        else this.avisos.error(mensajeDeError(e));
      },
    });
  }

  mensajeDesactivar(u: Usuario) {
    return (
      `${u.nombreCompleto} (${u.username}) ya no podrá iniciar sesión, y si tiene una sesión abierta se cerrará en su ` +
      `próxima acción. Sus carpetas, archivos, permisos compartidos e historial se conservan, y la cuenta se puede ` +
      `volver a activar.`
    );
  }
}
