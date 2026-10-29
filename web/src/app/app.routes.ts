import { Routes } from '@angular/router';
import { homeRedirect, requireRole } from './core/auth';

export const routes: Routes = [
  { path: '', pathMatch: 'full', canActivate: [homeRedirect], children: [] },
  { path: 'login', title: 'Sign in | Antri', loadComponent: () => import('./pages/login/login').then((m) => m.LoginPage) },
  {
    path: 'staff',
    title: 'Counter | Antri',
    canActivate: [requireRole('STAFF')],
    loadComponent: () => import('./pages/staff/staff-console').then((m) => m.StaffConsolePage),
  },
  {
    path: 'admin',
    canActivate: [requireRole('ADMIN')],
    loadComponent: () => import('./pages/admin/admin-shell').then((m) => m.AdminShell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'venues' },
      {
        path: 'venues',
        title: 'Venues | Antri',
        loadComponent: () => import('./pages/admin/venues').then((m) => m.VenuesPage),
      },
      {
        path: 'staff',
        title: 'Staff accounts | Antri',
        loadComponent: () => import('./pages/admin/staff-accounts').then((m) => m.StaffAccountsPage),
      },
    ],
  },
  {
    // Public: meant for a TV in the waiting room. No sign-in needed.
    path: 'display/:venueId',
    title: 'Now serving | Antri',
    loadComponent: () => import('./pages/display/display').then((m) => m.DisplayPage),
  },
  { path: '**', redirectTo: '' },
];
