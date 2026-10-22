import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Autenticacion } from '../../nucleo/autenticacion';
import { mensajeDeError } from '../../nucleo/errores';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login {
  private readonly autenticacion = inject(Autenticacion);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);

  readonly formulario = inject(FormBuilder).nonNullable.group({
    username: ['', Validators.required],
    password: ['', Validators.required],
  });
  readonly cargando = signal(false);
  readonly error = signal<string | null>(null);

  entrar() {
    if (this.formulario.invalid) {
      this.formulario.markAllAsTouched();
      return;
    }
    const { username, password } = this.formulario.getRawValue();
    this.cargando.set(true);
    this.error.set(null);
    this.autenticacion.iniciarSesion(username.trim(), password).subscribe({
      next: () => {
        // Vuelve a la pagina que se pidio antes de que el guard mandara aqui.
        const volver = this.ruta.snapshot.queryParamMap.get('volver');
        this.router.navigateByUrl(volver && volver.startsWith('/') && !volver.startsWith('/login') ? volver : '/');
      },
      error: (error) => {
        // La API da el mismo mensaje para usuario inexistente y contrasena
        // incorrecta (no revela que usernames existen): se muestra tal cual.
        this.error.set(mensajeDeError(error));
        this.cargando.set(false);
      },
    });
  }
}
