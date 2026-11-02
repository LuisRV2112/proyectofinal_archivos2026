import { Routes } from '@angular/router';
import { Layout } from './diseno/layout';
import { administradorGuard, invitadoGuard, sesionGuard } from './nucleo/guards';
import { Buscar } from './paginas/buscar/buscar';
import { CompartidoConmigoPagina } from './paginas/compartidos/conmigo';
import { CompartidoPorMiPagina } from './paginas/compartidos/por-mi';
import { Explorador } from './paginas/explorador/explorador';
import { Login } from './paginas/login/login';
import { PapeleraPagina } from './paginas/papelera/papelera';

// Todo menos el login va dentro del Layout y pasa por sesionGuard.
// Reportes, historial y usuarios son lazy (loadComponent) para que la carga
// inicial sea menor.
const cargarActividad = () => import('./paginas/actividad/actividad').then((m) => m.ActividadPagina);

export const routes: Routes = [
  { path: 'login', component: Login, canActivate: [invitadoGuard], title: 'Iniciar sesión' },
  {
    path: '',
    component: Layout,
    canActivate: [sesionGuard],
    // Se revisa en cada navegacion por si la sesion expira.
    canActivateChild: [sesionGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'explorador' },
      { path: 'explorador', component: Explorador, title: 'Mis documentos' },
      // :id llega como input()
      { path: 'explorador/:id', component: Explorador, title: 'Mis documentos' },
      { path: 'buscar', component: Buscar, title: 'Buscar' },
      { path: 'compartidos/conmigo', component: CompartidoConmigoPagina, title: 'Compartido conmigo' },
      { path: 'compartidos/por-mi', component: CompartidoPorMiPagina, title: 'Compartido por mí' },
      { path: 'papelera', component: PapeleraPagina, title: 'Papelera' },
      { path: 'reportes', loadComponent: () => import('./paginas/reportes/indice').then((m) => m.ReportesIndice), title: 'Reportes' },
      // Los reportes de administrador los bloquean la vista y la API.
      {
        path: 'reportes/:clave',
        loadComponent: () => import('./paginas/reportes/reporte').then((m) => m.ReportePagina),
        title: 'Reporte',
      },
      { path: 'actividad', loadComponent: cargarActividad, title: 'Mi actividad' },
      {
        path: 'admin',
        canActivate: [administradorGuard],
        canActivateChild: [administradorGuard],
        children: [
          { path: 'usuarios', loadComponent: () => import('./paginas/usuarios/usuarios').then((m) => m.UsuariosPagina), title: 'Usuarios' },
          // data.global llega como input
          { path: 'actividad', loadComponent: cargarActividad, data: { global: true }, title: 'Historial global' },
        ],
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
