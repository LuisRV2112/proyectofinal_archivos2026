import { Routes } from '@angular/router';
import { Layout } from './diseno/layout';
import { administradorGuard, invitadoGuard, sesionGuard } from './nucleo/guards';
import { ActividadPagina } from './paginas/actividad/actividad';
import { Buscar } from './paginas/buscar/buscar';
import { CompartidoConmigoPagina } from './paginas/compartidos/conmigo';
import { CompartidoPorMiPagina } from './paginas/compartidos/por-mi';
import { Explorador } from './paginas/explorador/explorador';
import { Login } from './paginas/login/login';
import { PapeleraPagina } from './paginas/papelera/papelera';
import { ReportesIndice } from './paginas/reportes/indice';
import { ReportePagina } from './paginas/reportes/reporte';
import { UsuariosPagina } from './paginas/usuarios/usuarios';

/**
 * Rutas. Todo lo que no es el login cuelga del Layout (menu lateral) y pasa
 * por sesionGuard; lo de /admin ademas por administradorGuard.
 */
export const routes: Routes = [
  { path: 'login', component: Login, canActivate: [invitadoGuard], title: 'Iniciar sesión' },
  {
    path: '',
    component: Layout,
    canActivate: [sesionGuard],
    // canActivateChild: el guard se vuelve a evaluar al navegar entre hijos,
    // asi una sesion que expira mientras se usa la app manda al login.
    canActivateChild: [sesionGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'explorador' },
      { path: 'explorador', component: Explorador, title: 'Mis documentos' },
      // :id llega al componente como input() (withComponentInputBinding).
      { path: 'explorador/:id', component: Explorador, title: 'Mis documentos' },
      { path: 'buscar', component: Buscar, title: 'Buscar' },
      { path: 'compartidos/conmigo', component: CompartidoConmigoPagina, title: 'Compartido conmigo' },
      { path: 'compartidos/por-mi', component: CompartidoPorMiPagina, title: 'Compartido por mí' },
      { path: 'papelera', component: PapeleraPagina, title: 'Papelera' },
      { path: 'reportes', component: ReportesIndice, title: 'Reportes' },
      // :clave elige el reporte del catalogo; los de administrador los
      // bloquea la vista (y la API con 403), porque comparten la ruta.
      { path: 'reportes/:clave', component: ReportePagina, title: 'Reporte' },
      { path: 'actividad', component: ActividadPagina, title: 'Mi actividad' },
      {
        path: 'admin',
        canActivate: [administradorGuard],
        canActivateChild: [administradorGuard],
        children: [
          { path: 'usuarios', component: UsuariosPagina, title: 'Usuarios' },
          // data.global llega al componente como input (withComponentInputBinding).
          { path: 'actividad', component: ActividadPagina, data: { global: true }, title: 'Historial global' },
        ],
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
