import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

// El menu esta en Layout para que no aparezca en el login.
@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: '<router-outlet />',
})
export class App {}
