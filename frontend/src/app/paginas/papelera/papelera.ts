import { DatePipe } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { Confirmacion } from '../../componentes/confirmacion';
import { Autenticacion } from '../../nucleo/autenticacion';
import { Avisos } from '../../nucleo/avisos';
import { mensajeDeError } from '../../nucleo/errores';
import { BytesPipe, formatearBytes } from '../../nucleo/formato';
import { ElementoPapelera, Papelera } from '../../nucleo/modelos';
import { PapeleraApi } from '../../servicios/papelera';

/**
 * Papelera del usuario. Lo que esta aqui NO se borro: solo tiene
 * `eliminado.estado = true` (estado EMBEBIDO en el recurso) y por eso
 * desaparece de los listados. Restaurar lo devuelve a su carpeta original;
 * eliminar definitivamente borra documento y contenido en GridFS y libera
 * espacio. Mientras este aqui, sigue ocupando espacio (regla 5.4).
 */
@Component({
  selector: 'app-papelera',
  imports: [DatePipe, BytesPipe, Confirmacion],
  templateUrl: './papelera.html',
  styles: `
    .resumen { margin: -8px 0 16px; }
    .contiene { font-size: 0.82rem; }
    .acciones { display: flex; gap: 4px; justify-content: flex-end; flex-wrap: wrap; }
  `,
})
export class PapeleraPagina implements OnInit {
  private readonly api = inject(PapeleraApi);
  private readonly avisos = inject(Avisos);
  private readonly autenticacion = inject(Autenticacion);

  readonly papelera = signal<Papelera | null>(null);
  readonly cargando = signal(true);
  readonly error = signal<string | null>(null);
  /** Elemento en proceso de restaurarse (deshabilita su fila). */
  readonly restaurando = signal<string | null>(null);
  readonly aEliminar = signal<ElementoPapelera | null>(null);
  readonly eliminando = signal(false);
  readonly errorEliminar = signal<string | null>(null);

  ngOnInit() {
    this.cargar();
  }

  cargar() {
    this.api.listar().subscribe({
      next: (p) => {
        this.papelera.set(p);
        this.cargando.set(false);
      },
      error: (e) => {
        this.error.set(mensajeDeError(e));
        this.cargando.set(false);
      },
    });
  }

  restaurar(elemento: ElementoPapelera) {
    this.restaurando.set(elemento._id);
    this.api.restaurar(elemento).subscribe({
      next: (r) => {
        this.restaurando.set(null);
        // Los avisos de la API explican si volvio a la raiz (su carpeta ya no
        // existe) o si se renombro por un choque de nombres.
        const texto = `"${r.nombre}" restaurado en ${r.ubicacion}.`;
        if (r.avisos.length) this.avisos.info(`${texto} ${r.avisos.join(' ')}`);
        else this.avisos.exito(texto);
        this.cargar();
      },
      error: (e) => {
        this.restaurando.set(null);
        this.avisos.error(mensajeDeError(e));
      },
    });
  }

  pedirEliminar(elemento: ElementoPapelera) {
    this.errorEliminar.set(null);
    this.aEliminar.set(elemento);
  }

  mensajeEliminar(e: ElementoPapelera): string {
    const que =
      e.tipo === 'CARPETA'
        ? `la carpeta "${e.nombre}" con ${e.contiene.carpetas} subcarpeta(s) y ${e.contiene.archivos} archivo(s) (${formatearBytes(e.contiene.bytes)})`
        : `"${e.nombre}" (${formatearBytes(e.tamano)})`;
    return `Se borrará para siempre ${que}, incluido su contenido. Esta acción NO se puede deshacer.`;
  }

  eliminar() {
    const elemento = this.aEliminar();
    if (!elemento) return;
    this.eliminando.set(true);
    this.errorEliminar.set(null);
    this.api.eliminarDefinitivamente(elemento).subscribe({
      next: (r) => {
        this.eliminando.set(false);
        this.aEliminar.set(null);
        this.avisos.exito(`"${elemento.nombre}" eliminado definitivamente. Se liberaron ${formatearBytes(r.bytesLiberados)}.`);
        // Se desconto de almacenamientoUsado: se refresca el dato del menu.
        this.autenticacion.refrescarPerfil();
        this.cargar();
      },
      error: (e) => {
        this.eliminando.set(false);
        this.errorEliminar.set(mensajeDeError(e));
      },
    });
  }
}
