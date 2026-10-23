import { Component, computed, inject, input, OnInit, output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Rol, Usuario } from '../../nucleo/modelos';
import { CambiosUsuario, NuevoUsuario } from '../../servicios/usuarios';

/**
 * Crear o editar un usuario. Las validaciones replican las del esquema del
 * backend (longitud y caracteres del username, formato del correo, 8
 * caracteres de contrasena) para avisar antes de enviar; las de unicidad
 * (username o correo ya usados) solo las puede hacer la API, y su mensaje
 * llega por el input `error`.
 */
@Component({
  selector: 'app-dialogo-usuario',
  imports: [ReactiveFormsModule],
  template: `
    <div class="fondo-dialogo" (click)="cancelar.emit()">
      <form class="dialogo" role="dialog" aria-modal="true" [formGroup]="formulario" (click)="$event.stopPropagation()" (ngSubmit)="enviar()">
        <h2>{{ usuario() ? 'Editar ' + usuario()!.username : 'Nuevo usuario' }}</h2>

        <label class="campo">
          <span>Nombre de usuario</span>
          <input formControlName="username" autocomplete="off" />
          @if (usuario()) {
            <small class="secundario">No se puede cambiar: es el identificador de inicio de sesión y aparece en el historial.</small>
          } @else if (invalido('username')) {
            <small class="texto-error">De 3 a 30 caracteres: minúsculas, números, punto, guion o guion bajo.</small>
          }
        </label>
        <label class="campo">
          <span>Nombre completo</span>
          <input formControlName="nombreCompleto" />
          @if (invalido('nombreCompleto')) {
            <small class="texto-error">Obligatorio.</small>
          }
        </label>
        <label class="campo">
          <span>Correo</span>
          <input type="email" formControlName="email" />
          @if (invalido('email')) {
            <small class="texto-error">Escribe un correo válido.</small>
          }
        </label>
        <label class="campo">
          <span>Rol</span>
          <select formControlName="rol">
            <option value="USUARIO">Usuario</option>
            <option value="ADMINISTRADOR">Administrador</option>
          </select>
          @if (esUnoMismo()) {
            <small class="secundario">No puedes quitarte a ti mismo el rol de administrador.</small>
          }
        </label>
        <label class="campo">
          <span>{{ usuario() ? 'Nueva contraseña (vacío = no cambiarla)' : 'Contraseña' }}</span>
          <input type="password" formControlName="password" autocomplete="new-password" />
          @if (invalido('password')) {
            <small class="texto-error">Al menos 8 caracteres.</small>
          }
        </label>

        @if (error()) {
          <div class="alerta alerta-error">{{ error() }}</div>
        }
        <div class="dialogo-acciones">
          <button class="boton" type="button" (click)="cancelar.emit()" [disabled]="ocupado()">Cancelar</button>
          <button class="boton boton-primario" type="submit" [disabled]="ocupado()">
            {{ ocupado() ? 'Guardando…' : usuario() ? 'Guardar cambios' : 'Crear usuario' }}
          </button>
        </div>
      </form>
    </div>
  `,
})
export class DialogoUsuario implements OnInit {
  /** null = crear; un usuario = editarlo. */
  readonly usuario = input<Usuario | null>(null);
  /** Id del administrador con sesion: no puede quitarse su propio rol. */
  readonly idPropio = input<string | undefined>(undefined);
  readonly ocupado = input(false);
  readonly error = input<string | null>(null);
  readonly crear = output<NuevoUsuario>();
  readonly guardar = output<CambiosUsuario>();
  readonly cancelar = output<void>();

  readonly esUnoMismo = computed(() => !!this.usuario() && this.usuario()!._id === this.idPropio());

  readonly formulario = inject(FormBuilder).nonNullable.group({
    username: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(30), Validators.pattern(/^[a-z0-9._-]+$/)]],
    nombreCompleto: ['', [Validators.required, Validators.maxLength(100)]],
    email: ['', [Validators.required, Validators.email]],
    rol: ['USUARIO' as Rol],
    password: ['', [Validators.minLength(8)]],
  });

  ngOnInit() {
    const usuario = this.usuario();
    if (usuario) {
      this.formulario.patchValue(usuario);
      this.formulario.controls.username.disable();
      if (this.esUnoMismo()) this.formulario.controls.rol.disable();
    } else {
      this.formulario.controls.password.addValidators(Validators.required);
    }
  }

  invalido(campo: keyof typeof this.formulario.controls) {
    const control = this.formulario.controls[campo];
    return control.invalid && control.touched;
  }

  enviar() {
    // El username se pasa a minusculas igual que hace el backend, para que la
    // validacion del patron no rechace "MGarcia".
    const username = this.formulario.controls.username;
    if (username.enabled) username.setValue(username.value.trim().toLowerCase());
    if (this.formulario.invalid) {
      this.formulario.markAllAsTouched();
      return;
    }
    const valores = this.formulario.getRawValue();
    const usuario = this.usuario();
    if (!usuario) {
      this.crear.emit({ ...valores, nombreCompleto: valores.nombreCompleto.trim(), email: valores.email.trim() });
      return;
    }
    // Solo lo que cambio: el historial registra que se modifico, y una
    // contrasena vacia significa "dejarla como esta".
    const cambios: CambiosUsuario = {};
    if (valores.nombreCompleto.trim() !== usuario.nombreCompleto) cambios.nombreCompleto = valores.nombreCompleto.trim();
    if (valores.email.trim().toLowerCase() !== usuario.email) cambios.email = valores.email.trim();
    if (valores.rol !== usuario.rol) cambios.rol = valores.rol;
    if (valores.password) cambios.password = valores.password;
    this.guardar.emit(cambios);
  }
}
