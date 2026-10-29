import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Auth } from '../../core/auth';

@Component({
  selector: 'app-admin-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <header class="top">
      <a class="brand num" routerLink="/admin">Antri</a>
      <nav aria-label="Admin">
        <a routerLink="venues" routerLinkActive="active" ariaCurrentWhenActive="page">Venues</a>
        <a routerLink="staff" routerLinkActive="active" ariaCurrentWhenActive="page">Staff accounts</a>
      </nav>
      <div class="who">
        <span class="small muted">{{ auth.user()?.name }}</span>
        <button class="btn btn-quiet" type="button" (click)="auth.logout()">Sign out</button>
      </div>
    </header>
    <div class="content"><router-outlet /></div>
  `,
  styles: `
    :host { display: block; min-height: 100vh; }
    .top {
      display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem 2rem;
      padding: 0.75rem clamp(1rem, 3vw, 2rem);
      background: var(--ink); color: #fff;
    }
    .brand { font-size: 2rem; text-decoration: none; color: var(--marigold); }
    nav { display: flex; gap: 0.25rem; }
    nav a {
      padding: 0.5rem 0.75rem; border-radius: var(--radius-sm);
      color: #c9d1dc; font-weight: 600; text-decoration: none;
    }
    nav a:hover { color: #fff; }
    nav a.active { background: rgba(255, 255, 255, 0.1); color: #fff; }
    .who { display: flex; align-items: center; gap: 0.5rem; margin-left: auto; }
    .who .muted { color: #c9d1dc; }
    .who .btn { color: #fff; }
    .content { max-width: 1240px; margin: 0 auto; padding: 2rem clamp(1rem, 3vw, 2rem) 4rem; }
  `,
})
export class AdminShell {
  protected readonly auth = inject(Auth);
}
