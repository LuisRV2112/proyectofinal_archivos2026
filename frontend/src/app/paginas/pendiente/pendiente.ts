import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

/**
 * Marcador temporal para los modulos de los bloques 7.2 y 7.3: permite
 * navegar todo el menu desde ya. Cada ruta lo reemplaza su pantalla real.
 */
@Component({
  selector: 'app-pendiente',
  template: `
    <h1>{{ titulo }}</h1>
    <p class="secundario">Este módulo se implementa en el siguiente bloque de la Fase 7.</p>
  `,
})
export class Pendiente {
  readonly titulo = inject(ActivatedRoute).snapshot.title ?? '';
}
