import { NgComponentOutlet } from '@angular/common';
import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { Autenticacion } from '../../nucleo/autenticacion';
import { mensajeDeError } from '../../nucleo/errores';
import { AccionPipe } from '../../nucleo/formato';
import { ACCIONES, Usuario } from '../../nucleo/modelos';
import { Reportes } from '../../servicios/reportes';
import { UsuariosApi } from '../../servicios/usuarios';
import { DefinicionReporte, Filtro, REPORTES } from './catalogo';

const LIMITE_PAGINA = 20;

/** Fecha local en formato AAAA-MM-DD (el que usan <input type="date"> y la API). */
function fechaLocal(fecha: Date): string {
  const dosDigitos = (n: number) => String(n).padStart(2, '0');
  return `${fecha.getFullYear()}-${dosDigitos(fecha.getMonth() + 1)}-${dosDigitos(fecha.getDate())}`;
}

/**
 * Vista de UN reporte (/reportes/:clave): sus filtros y su tabla. Que
 * filtros mostrar y que tabla usar sale del catalogo, asi los 14 reportes
 * comparten esta pantalla sin un @switch de doce casos.
 */
@Component({
  selector: 'app-reporte',
  imports: [FormsModule, RouterLink, NgComponentOutlet, AccionPipe],
  templateUrl: './reporte.html',
  styles: `
    .filtros { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px;
      align-items: end; padding: 16px; margin-bottom: 16px; background: var(--superficie);
      border: 1px solid var(--borde); border-radius: 8px; }
    .casilla { flex-direction: row; align-items: center; gap: 6px; }
    .volver { display: inline-block; margin-bottom: 8px; font-size: 0.9rem; }
    .descripcion { margin: -8px 0 16px; }
    .paginacion { display: flex; gap: 10px; align-items: center; justify-content: flex-end; margin-top: 12px; }
  `,
})
export class ReportePagina {
  private readonly reportes = inject(Reportes);
  private readonly usuariosApi = inject(UsuariosApi);
  readonly esAdministrador = inject(Autenticacion).esAdministrador;

  /** :clave de la ruta (withComponentInputBinding). */
  readonly clave = input.required<string>();

  readonly definicion = computed(() => REPORTES.find((r) => r.clave === this.clave()) ?? null);
  /** Un usuario normal que escribe a mano la URL de un reporte de administrador. */
  readonly prohibido = computed(() => !!this.definicion()?.soloAdmin && !this.esAdministrador());

  readonly acciones = ACCIONES;
  readonly usuarios = signal<Usuario[]>([]);

  // Valores de los filtros. Cada reporte usa solo los que declara en el catalogo.
  readonly desde = signal('');
  readonly hasta = signal('');
  readonly extension = signal('');
  readonly incluirPapelera = signal(true);
  readonly limite = signal(10);
  readonly tipo = signal('');
  readonly usuarioId = signal('');
  readonly accion = signal('');
  readonly recursoTipo = signal('');
  readonly periodo = signal('month');
  readonly excluirSesion = signal(false);
  readonly contar = signal('directos');

  /**
   * La respuesta va junto a la clave del reporte que la pidio: al cambiar de
   * reporte, la tabla nueva no llega a recibir los datos del anterior (que
   * tienen otra forma) mientras se carga la suya.
   */
  readonly resultado = signal<{ clave: string; datos: unknown } | null>(null);
  readonly pagina = signal(1);
  readonly cargando = signal(false);
  readonly error = signal<string | null>(null);
  private consulta?: Subscription;

  readonly datosActuales = computed(() => {
    const r = this.resultado();
    return r && r.clave === this.definicion()?.clave ? r.datos : null;
  });

  readonly totalPaginas = computed(() => {
    const datos = this.datosActuales() as { total?: number; limite?: number } | null;
    if (!this.definicion()?.paginado || !datos?.total || !datos.limite) return 1;
    return Math.max(1, Math.ceil(datos.total / datos.limite));
  });

  constructor() {
    // Al entrar a un reporte (o pasar de uno a otro, que reutiliza este
    // componente): filtros a sus valores por defecto y primera consulta.
    effect(() => {
      const definicion = this.definicion();
      untracked(() => {
        this.consulta?.unsubscribe();
        this.resultado.set(null);
        this.error.set(null);
        if (!definicion || this.prohibido()) return;
        this.reiniciarFiltros(definicion);
        if (this.usa('usuario') && this.esAdministrador() && !this.usuarios().length) this.cargarUsuarios();
        this.consultar();
      });
    });
  }

  usa(filtro: Filtro): boolean {
    const definicion = this.definicion();
    if (!definicion?.filtros.includes(filtro)) return false;
    // Elegir usuario es solo del administrador; el normal siempre ve el suyo.
    return filtro !== 'usuario' || this.esAdministrador();
  }

  private reiniciarFiltros(definicion: DefinicionReporte) {
    // Los reportes que exigen rango arrancan con el año en curso.
    const hoy = new Date();
    this.desde.set(definicion.rangoObligatorio ? `${hoy.getFullYear()}-01-01` : '');
    this.hasta.set(definicion.rangoObligatorio ? fechaLocal(hoy) : '');
    this.extension.set('');
    this.incluirPapelera.set(true);
    this.limite.set(definicion.limite ?? 10);
    this.tipo.set('');
    this.usuarioId.set('');
    this.accion.set('');
    this.recursoTipo.set('');
    this.periodo.set('month');
    this.excluirSesion.set(false);
    this.contar.set('directos');
  }

  private cargarUsuarios() {
    this.usuariosApi.listar().subscribe({ next: (u) => this.usuarios.set(u) });
  }

  /** Solo los filtros que el reporte declara; los vacios no se envian. */
  private parametros(pagina: number) {
    const definicion = this.definicion()!;
    const usa = (f: Filtro) => this.usa(f);
    return {
      ...(usa('rango') && { desde: this.desde(), hasta: this.hasta() }),
      ...(usa('extension') && { extension: this.extension() }),
      ...(usa('incluirPapelera') && { incluirPapelera: this.incluirPapelera() }),
      ...(usa('limite') && { limite: this.limite() }),
      ...(usa('tipo') && { tipo: this.tipo() }),
      ...(usa('usuario') && { usuarioId: this.usuarioId() }),
      ...(usa('accion') && { accion: this.accion() }),
      ...(usa('recursoTipo') && { recursoTipo: this.recursoTipo() }),
      ...(usa('periodo') && { periodo: this.periodo() }),
      ...(usa('excluirSesion') && { excluirSesion: this.excluirSesion() }),
      ...(usa('contar') && { contar: this.contar() }),
      ...(definicion.paginado && { pagina, limite: LIMITE_PAGINA }),
    };
  }

  consultar(pagina = 1) {
    const definicion = this.definicion();
    if (!definicion) return;
    this.consulta?.unsubscribe();
    this.cargando.set(true);
    this.error.set(null);
    this.consulta = this.reportes.consultar<unknown>(definicion.ruta, this.parametros(pagina)).subscribe({
      next: (datos) => {
        this.resultado.set({ clave: definicion.clave, datos });
        this.pagina.set(pagina);
        this.cargando.set(false);
      },
      // El mensaje de la API (p. ej. "desde no puede ser posterior a hasta").
      error: (e) => {
        this.error.set(mensajeDeError(e));
        this.cargando.set(false);
      },
    });
  }

  limpiar() {
    this.reiniciarFiltros(this.definicion()!);
    this.consultar();
  }
}
