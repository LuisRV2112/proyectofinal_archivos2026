import { Component, computed, inject, OnInit } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Autenticacion } from '../nucleo/autenticacion';
import { Avisos } from '../nucleo/avisos';
import { BytesPipe } from '../nucleo/formato';
import { Almacenamiento } from '../nucleo/modelos';

interface OpcionMenu {
  ruta: string;
  texto: string;
  /** Solo se muestra al administrador (seccion 6 del modelo). */
  soloAdmin?: boolean;
}

interface GrupoMenu {
  titulo: string;
  opciones: OpcionMenu[];
}

// El menu se arma desde estos datos y se filtra por rol: el usuario normal no
// ve las opciones de administracion. Ocultarlas es comodidad; el bloqueo real
// lo hacen el guard (pantalla) y la API (datos).
const MENU: GrupoMenu[] = [
  {
    titulo: 'Documentos',
    opciones: [
      { ruta: '/explorador', texto: 'Mis documentos' },
      { ruta: '/buscar', texto: 'Buscar' },
      { ruta: '/compartidos/conmigo', texto: 'Compartido conmigo' },
      { ruta: '/compartidos/por-mi', texto: 'Compartido por mí' },
      { ruta: '/papelera', texto: 'Papelera' },
    ],
  },
  {
    titulo: 'Consultas',
    opciones: [
      { ruta: '/reportes', texto: 'Reportes' },
      { ruta: '/actividad', texto: 'Mi actividad' },
    ],
  },
  {
    titulo: 'Administración',
    opciones: [
      { ruta: '/admin/usuarios', texto: 'Usuarios', soloAdmin: true },
      { ruta: '/admin/actividad', texto: 'Historial global', soloAdmin: true },
    ],
  },
];

@Component({
  selector: 'app-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, BytesPipe],
  templateUrl: './layout.html',
  styleUrl: './layout.css',
})
export class Layout implements OnInit {
  readonly autenticacion = inject(Autenticacion);
  readonly avisos = inject(Avisos);
  private readonly router = inject(Router);

  readonly menu = computed(() => {
    const admin = this.autenticacion.esAdministrador();
    return MENU.map((grupo) => ({ ...grupo, opciones: grupo.opciones.filter((o) => admin || !o.soloAdmin) })).filter(
      (grupo) => grupo.opciones.length > 0,
    );
  });

  ngOnInit() {
    this.autenticacion.refrescarPerfil();
  }

  /** Porcentaje de la cuota en uso, para el medidor (0 a 100). */
  porcentaje(a: Almacenamiento) {
    if (a.cuotaAlmacenamiento <= 0) return 100;
    return Math.min(100, Math.round((a.almacenamientoUsado / a.cuotaAlmacenamiento) * 100));
  }

  salir() {
    this.autenticacion.cerrarSesion();
    this.router.navigate(['/login']);
  }
}
