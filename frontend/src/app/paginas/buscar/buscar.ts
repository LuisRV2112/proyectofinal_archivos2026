import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SelectorCarpeta } from '../../componentes/selector-carpeta';
import { VistaPrevia } from '../../componentes/vista-previa';
import { Autenticacion } from '../../nucleo/autenticacion';
import { Avisos } from '../../nucleo/avisos';
import { mensajeDeError } from '../../nucleo/errores';
import { BytesPipe } from '../../nucleo/formato';
import { Archivo, Paginado } from '../../nucleo/modelos';
import { Documentos, FiltrosBusqueda } from '../../servicios/documentos';

const LIMITE = 20;

/**
 * Busqueda de archivos con los filtros de la Fase 4 (GET /api/archivos/buscar).
 * Busca entre todo lo que el usuario puede leer: lo propio, lo compartido con
 * el y lo que hay dentro de carpetas compartidas (el alcance lo pone la API).
 */
@Component({
  selector: 'app-buscar',
  imports: [FormsModule, RouterLink, DatePipe, BytesPipe, SelectorCarpeta, VistaPrevia],
  templateUrl: './buscar.html',
  styles: `
    .filtros { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 12px;
      align-items: end; padding: 16px; margin-bottom: 16px; background: var(--superficie);
      border: 1px solid var(--borde); border-radius: 8px; }
    .texto { grid-column: span 2; }
    .carpeta { display: flex; gap: 6px; align-items: center; }
    .casilla { flex-direction: row; align-items: center; gap: 6px; }
    .nombre { background: none; border: none; padding: 0; font: inherit; color: var(--primario); cursor: pointer; text-align: left; }
    .paginacion { display: flex; gap: 10px; align-items: center; justify-content: flex-end; margin-top: 12px; }
    @media (max-width: 600px) { .texto { grid-column: auto; } }
  `,
})
export class Buscar implements OnInit {
  private readonly documentos = inject(Documentos);
  private readonly avisos = inject(Avisos);
  private readonly sesion = inject(Autenticacion).sesion;

  // Filtros del formulario.
  readonly texto = signal('');
  readonly extension = signal('');
  readonly carpeta = signal<{ id: string; ruta: string } | null>(null);
  readonly enSubarbol = signal(true);
  readonly desde = signal('');
  readonly hasta = signal('');

  readonly resultado = signal<Paginado<Archivo> | null>(null);
  readonly pagina = signal(1);
  readonly cargando = signal(false);
  readonly error = signal<string | null>(null);
  readonly eligiendoCarpeta = signal(false);
  readonly previa = signal<Archivo | null>(null);

  readonly totalPaginas = computed(() => {
    const r = this.resultado();
    return r ? Math.max(1, Math.ceil(r.total / r.limite)) : 1;
  });

  ngOnInit() {
    this.buscar();
  }

  buscar(pagina = 1) {
    const filtros: FiltrosBusqueda = {
      texto: this.texto().trim(),
      extension: this.extension(),
      carpetaId: this.carpeta()?.id,
      // enSubarbol solo tiene sentido con una carpeta elegida.
      enSubarbol: this.carpeta() ? this.enSubarbol() : undefined,
      desde: this.desde(),
      hasta: this.hasta(),
      pagina,
      limite: LIMITE,
    };
    this.cargando.set(true);
    this.error.set(null);
    this.documentos.buscar(filtros).subscribe({
      next: (resultado) => {
        this.resultado.set(resultado);
        this.pagina.set(pagina);
        this.cargando.set(false);
      },
      error: (e) => {
        this.error.set(mensajeDeError(e));
        this.cargando.set(false);
      },
    });
  }

  limpiar() {
    this.texto.set('');
    this.extension.set('');
    this.carpeta.set(null);
    this.enSubarbol.set(true);
    this.desde.set('');
    this.hasta.set('');
    this.buscar();
  }

  elegirCarpeta(id: string | null) {
    this.eligiendoCarpeta.set(false);
    // null = la raiz: equivale a no acotar por carpeta.
    if (!id) {
      this.carpeta.set(null);
      return;
    }
    this.documentos.carpeta(id).subscribe((c) => this.carpeta.set({ id, ruta: c.carpeta?.ruta ?? '/' }));
  }

  esPropio(archivo: Archivo) {
    return archivo.propietarioId === this.sesion()?.id;
  }

  descargar(archivo: Archivo) {
    this.avisos.info(`Descargando "${archivo.nombre}"…`);
    this.documentos.descargar(archivo).subscribe({ error: (e) => this.avisos.error(mensajeDeError(e)) });
  }
}
