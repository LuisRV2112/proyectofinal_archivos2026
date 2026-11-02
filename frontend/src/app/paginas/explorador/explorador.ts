import { HttpEventType } from '@angular/common/http';
import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { Observable } from 'rxjs';
import { Confirmacion } from '../../componentes/confirmacion';
import { DialogoCompartir } from '../../componentes/dialogo-compartir';
import { DialogoNombre } from '../../componentes/dialogo-nombre';
import { DialogoNuevoArchivo, NuevoArchivo } from '../../componentes/dialogo-nuevo-archivo';
import { SelectorCarpeta } from '../../componentes/selector-carpeta';
import { VistaPrevia } from '../../componentes/vista-previa';
import { Autenticacion } from '../../nucleo/autenticacion';
import { Avisos } from '../../nucleo/avisos';
import { mensajeDeError } from '../../nucleo/errores';
import { BytesPipe, formatearBytes } from '../../nucleo/formato';
import { Archivo, Carpeta, ContenidoCarpeta } from '../../nucleo/modelos';
import { Documentos } from '../../servicios/documentos';

type Elemento = { tipo: 'carpeta'; dato: Carpeta } | { tipo: 'archivo'; dato: Archivo };

// Solo hay un dialogo abierto a la vez.
type Dialogo =
  | { tipo: 'crear' }
  | { tipo: 'nuevoArchivo' }
  | { tipo: 'renombrar'; elemento: Elemento }
  | { tipo: 'mover'; elemento: Elemento }
  | { tipo: 'eliminar'; elemento: Elemento }
  | { tipo: 'compartir'; elemento: Elemento }
  | { tipo: 'previa'; archivo: Archivo };

interface Subida {
  id: number;
  nombre: string;
  progreso: number;
  estado: 'subiendo' | 'listo' | 'error';
  mensaje?: string;
}

// El backend tambien lo valida; aqui es para avisar antes de subir.
const EXTENSIONES = ['txt', 'md'];
const TAMANO_MAXIMO = 5 * 1024 * 1024;

@Component({
  selector: 'app-explorador',
  imports: [RouterLink, DatePipe, BytesPipe, Confirmacion, DialogoCompartir, DialogoNombre, DialogoNuevoArchivo, SelectorCarpeta, VistaPrevia],
  templateUrl: './explorador.html',
  styleUrl: './explorador.css',
})
export class Explorador {
  private readonly documentos = inject(Documentos);
  private readonly autenticacion = inject(Autenticacion);
  private readonly avisos = inject(Avisos);
  private readonly router = inject(Router);

  // Sin id = raiz
  readonly id = input<string>();

  readonly contenido = signal<ContenidoCarpeta | null>(null);
  readonly cargando = signal(false);
  readonly error = signal<string | null>(null);
  readonly dialogo = signal<Dialogo | null>(null);
  readonly ocupado = signal(false);
  readonly errorDialogo = signal<string | null>(null);
  readonly subidas = signal<Subida[]>([]);
  readonly arrastrando = signal(false);

  readonly filas = computed<Elemento[]>(() => {
    const c = this.contenido();
    if (!c) return [];
    return [
      ...c.carpetas.map((dato) => ({ tipo: 'carpeta' as const, dato })),
      ...c.archivos.map((dato) => ({ tipo: 'archivo' as const, dato })),
    ];
  });

  // Solo para mostrar u ocultar botones; la API valida igual.
  // Crear, subir, mover y eliminar: propietario. Renombrar: EDICION.
  readonly esPropio = computed(() => this.contenido()?.acceso.nivel === 'PROPIETARIO');
  readonly puedeEditar = computed(() => ['PROPIETARIO', 'EDICION'].includes(this.contenido()?.acceso.nivel ?? ''));
  readonly esCompartida = computed(() => !!this.contenido()?.carpeta && !this.esPropio());

  private contadorSubidas = 0;

  constructor() {
    // Recarga al cambiar el :id; el componente se reutiliza.
    effect(() => this.cargar(this.id() ?? null));
  }

  cargar(id: string | null = this.id() ?? null) {
    this.cargando.set(true);
    this.error.set(null);
    this.documentos.contenido(id).subscribe({
      next: (contenido) => {
        this.contenido.set(contenido);
        this.cargando.set(false);
      },
      error: (e) => {
        this.error.set(mensajeDeError(e));
        this.contenido.set(null);
        this.cargando.set(false);
      },
    });
  }

  // Navegacion

  abrir(elemento: Elemento) {
    if (elemento.tipo === 'carpeta') this.router.navigate(['/explorador', elemento.dato._id]);
    else this.abrirDialogo({ tipo: 'previa', archivo: elemento.dato });
  }

  subirNivel() {
    const c = this.contenido();
    if (!c?.carpeta) return;
    // Las migas ya vienen recortadas a lo que puede ver.
    const migas = c.migas;
    if (migas.length > 1) this.router.navigate(['/explorador', migas[migas.length - 2]._id]);
    else if (this.esPropio()) this.router.navigate(['/explorador']);
    else this.router.navigate(['/compartidos/conmigo']);
  }

  // Dialogos

  abrirDialogo(dialogo: Dialogo) {
    this.errorDialogo.set(null);
    this.ocupado.set(false);
    this.dialogo.set(dialogo);
  }

  cerrarDialogo() {
    if (!this.ocupado()) this.dialogo.set(null);
  }

  crearCarpeta(nombre: string) {
    const padreId = this.contenido()?.carpeta?._id ?? null;
    this.ejecutar(this.documentos.crearCarpeta(nombre, padreId), `Carpeta "${nombre}" creada`);
  }

  crearArchivo({ nombre, contenido, etiquetas }: NuevoArchivo) {
    const carpetaId = this.contenido()?.carpeta?._id ?? null;
    this.ejecutar(this.documentos.crearArchivo(nombre, contenido, carpetaId, etiquetas), `Archivo "${nombre}" creado`);
  }

  renombrar(elemento: Elemento, nombre: string) {
    const operacion =
      elemento.tipo === 'carpeta'
        ? this.documentos.renombrarCarpeta(elemento.dato._id, nombre)
        : this.documentos.renombrarArchivo(elemento.dato._id, nombre);
    this.ejecutar(operacion, `Renombrado a "${nombre}"`);
  }

  mover(elemento: Elemento, destinoId: string | null) {
    const operacion =
      elemento.tipo === 'carpeta'
        ? this.documentos.moverCarpeta(elemento.dato._id, destinoId)
        : this.documentos.moverArchivo(elemento.dato._id, destinoId);
    this.ejecutar(operacion, `"${elemento.dato.nombre}" movido`);
  }

  eliminar(elemento: Elemento) {
    const operacion =
      elemento.tipo === 'carpeta'
        ? this.documentos.eliminarCarpeta(elemento.dato._id)
        : this.documentos.eliminarArchivo(elemento.dato._id);
    this.ejecutar(operacion, `"${elemento.dato.nombre}" se envió a la papelera`);
  }

  mensajeEliminar(elemento: Elemento): string {
    return elemento.tipo === 'carpeta'
      ? `La carpeta "${elemento.dato.nombre}" y TODO su contenido irán a la papelera. Podrás restaurarlos desde ahí.`
      : `"${elemento.dato.nombre}" irá a la papelera. Podrás restaurarlo desde ahí.`;
  }

  // Si la API rechaza la operacion, el dialogo queda abierto con el error.
  private ejecutar(operacion: Observable<unknown>, exito: string) {
    this.ocupado.set(true);
    this.errorDialogo.set(null);
    operacion.subscribe({
      next: () => {
        this.ocupado.set(false);
        this.dialogo.set(null);
        this.avisos.exito(exito);
        this.cargar();
        // Actualiza el espacio usado en el menu.
        this.autenticacion.refrescarPerfil();
      },
      error: (e) => {
        this.ocupado.set(false);
        this.errorDialogo.set(mensajeDeError(e));
      },
    });
  }

  descargar(archivo: Archivo) {
    this.avisos.info(`Descargando "${archivo.nombre}"…`);
    this.documentos.descargar(archivo).subscribe({ error: (e) => this.avisos.error(mensajeDeError(e)) });
  }

  // Subida (boton o arrastrar y soltar)

  alElegirArchivos(evento: Event) {
    const campo = evento.target as HTMLInputElement;
    this.subirArchivos(campo.files);
    campo.value = ''; // permite volver a elegir el mismo archivo
  }

  alArrastrar(evento: DragEvent) {
    if (!this.esPropio()) return;
    evento.preventDefault(); // sin esto el navegador abriria el archivo
    this.arrastrando.set(true);
  }

  alSoltar(evento: DragEvent) {
    evento.preventDefault();
    this.arrastrando.set(false);
    if (this.esPropio()) this.subirArchivos(evento.dataTransfer?.files ?? null);
  }

  private subirArchivos(lista: FileList | null) {
    const carpetaId = this.contenido()?.carpeta?._id ?? null;
    for (const archivo of Array.from(lista ?? [])) {
      const subida: Subida = { id: ++this.contadorSubidas, nombre: archivo.name, progreso: 0, estado: 'subiendo' };
      this.subidas.update((s) => [...s, subida]);

      const extension = archivo.name.split('.').pop()?.toLowerCase() ?? '';
      if (!archivo.name.includes('.') || !EXTENSIONES.includes(extension)) {
        this.actualizarSubida(subida.id, { estado: 'error', mensaje: 'Solo se aceptan archivos .txt y .md' });
        continue;
      }
      if (archivo.size > TAMANO_MAXIMO) {
        this.actualizarSubida(subida.id, {
          estado: 'error',
          mensaje: `Pesa ${formatearBytes(archivo.size)}; el máximo es ${formatearBytes(TAMANO_MAXIMO)}`,
        });
        continue;
      }

      this.documentos.subir(archivo, carpetaId).subscribe({
        next: (evento) => {
          if (evento.type === HttpEventType.UploadProgress && evento.total) {
            this.actualizarSubida(subida.id, { progreso: Math.round((evento.loaded / evento.total) * 100) });
          } else if (evento.type === HttpEventType.Response) {
            this.actualizarSubida(subida.id, { estado: 'listo', progreso: 100 });
            this.cargar();
            // Actualiza el espacio usado en el menu.
            this.autenticacion.refrescarPerfil();
          }
        },
        error: (e) => this.actualizarSubida(subida.id, { estado: 'error', mensaje: mensajeDeError(e) }),
      });
    }
  }

  private actualizarSubida(id: number, cambios: Partial<Subida>) {
    this.subidas.update((lista) => lista.map((s) => (s.id === id ? { ...s, ...cambios } : s)));
  }

  limpiarSubidas() {
    this.subidas.update((lista) => lista.filter((s) => s.estado === 'subiendo'));
  }
}
