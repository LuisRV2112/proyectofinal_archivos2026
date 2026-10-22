import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/** Raiz: solo el router. El menu lateral vive en Layout, fuera del login. */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: '<router-outlet />',
})
export class App {}
