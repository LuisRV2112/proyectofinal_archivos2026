import { DatePipe } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { VistaPrevia } from '../../componentes/vista-previa';
import { Avisos } from '../../nucleo/avisos';
import { mensajeDeError } from '../../nucleo/errores';
import { BytesPipe } from '../../nucleo/formato';
import { Archivo, CompartidoConmigo } from '../../nucleo/modelos';
import { Comparticion } from '../../servicios/comparticion';
import { Documentos } from '../../servicios/documentos';

/**
 * Lo que otros compartieron directamente con el usuario. Una carpeta se abre
 * en el explorador, donde su contenido es accesible por herencia.
 */
@Component({
  selector: 'app-compartido-conmigo',
  imports: [RouterLink, DatePipe, BytesPipe, VistaPrevia],
  template: `
    <h1>Compartido conmigo</h1>
    @if (error()) {
      <div class="alerta alerta-error">{{ error() }}</div>
    } @else if (cargando()) {
      <p class="secundario">Cargando…</p>
    } @else {
      <table class="tabla">
        <thead>
          <tr><th>Nombre</th><th>Propietario</th><th>Tu nivel</th><th class="numero">Tamaño</th><th>Recibido</th><th></th></tr>
        </thead>
        <tbody>
          @for (r of recursos(); track r._id) {
            <tr>
              <td>
                @if (r.tipo === 'CARPETA') {
                  <a [routerLink]="['/explorador', r._id]">📁 {{ r.nombre }}</a>
                } @else {
                  <button type="button" class="enlace" (click)="previa.set(comoArchivo(r))">📄 {{ r.nombre }}</button>
                }
              </td>
              <td>{{ r.propietario.nombreCompleto }}</td>
              <td><span class="nivel">{{ r.nivel }}</span></td>
              <td class="numero">{{ r.tipo === 'ARCHIVO' ? (r.tamano | bytes) : '—' }}</td>
              <td>{{ r.otorgadoEn | date: 'dd/MM/yyyy HH:mm' }}</td>
              <td>
                @if (r.tipo === 'ARCHIVO') {
                  <button class="boton boton-chico" type="button" (click)="descargar(r)">Descargar</button>
                } @else {
                  <a class="boton boton-chico" [routerLink]="['/explorador', r._id]">Abrir</a>
                }
              </td>
            </tr>
          } @empty {
            <tr><td colspan="6" class="secundario">Nadie ha compartido nada contigo todavía.</td></tr>
          }
        </tbody>
      </table>
    }
    @if (previa(); as archivo) {
      <app-vista-previa [archivo]="archivo" (cerrar)="previa.set(null)" />
    }
  `,
  styles: `
    .enlace { background: none; border: none; padding: 0; font: inherit; color: var(--primario); cursor: pointer; }
    .nivel { font-size: 0.78rem; padding: 2px 8px; border-radius: 10px; background: var(--primario-suave); color: var(--primario); }
  `,
})
export class CompartidoConmigoPagina implements OnInit {
  private readonly comparticion = inject(Comparticion);
  private readonly documentos = inject(Documentos);
  private readonly avisos = inject(Avisos);

  readonly recursos = signal<CompartidoConmigo[]>([]);
  readonly cargando = signal(true);
  readonly error = signal<string | null>(null);
  readonly previa = signal<Archivo | null>(null);

  ngOnInit() {
    this.comparticion.conmigo().subscribe({
      next: (r) => {
        this.recursos.set(r);
        this.cargando.set(false);
      },
      error: (e) => {
        this.error.set(mensajeDeError(e));
        this.cargando.set(false);
      },
    });
  }

  /** La vista previa solo usa id, nombre, extension y tamano. */
  comoArchivo(r: CompartidoConmigo): Archivo {
    return r as unknown as Archivo;
  }

  descargar(r: CompartidoConmigo) {
    this.avisos.info(`Descargando "${r.nombre}"…`);
    this.documentos.descargar(r).subscribe({ error: (e) => this.avisos.error(mensajeDeError(e)) });
  }
}
