import { HttpInterceptorFn } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { Api } from './api';
import { Role, Session } from './models';

const STORAGE_KEY = 'antri.session';

function readStoredSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

@Injectable({ providedIn: 'root' })
export class Auth {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly session = signal<Session | null>(readStoredSession());

  readonly user = computed(() => this.session()?.user ?? null);
  readonly token = computed(() => this.session()?.accessToken ?? null);

  async login(email: string, password: string): Promise<Session> {
    const session = await this.api.login(email.trim(), password);
    this.session.set(session);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } catch {
      // Private mode or blocked storage: the session still works until reload.
    }
    return session;
  }

  logout() {
    this.session.set(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    void this.router.navigateByUrl('/login');
  }

  /** Where each role lands after signing in. */
  homeFor(role: Role | undefined): string {
    if (role === 'ADMIN') return '/admin';
    if (role === 'STAFF') return '/staff';
    return '/login';
  }
}

/** Adds the bearer token; a 401 on an authenticated request means the session ended. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(Auth);
  const token = auth.token();
  const request = token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;
  return next(request).pipe(
    catchError((error) => {
      if (token && error?.status === 401) auth.logout();
      return throwError(() => error);
    }),
  );
};

/** Lets a route through only for the given role; everyone else goes to their own home. */
export function requireRole(role: Role): CanActivateFn {
  return () => {
    const auth = inject(Auth);
    const user = auth.user();
    if (user?.role === role) return true;
    return inject(Router).parseUrl(user ? auth.homeFor(user.role) : '/login');
  };
}

export const homeRedirect: CanActivateFn = () => {
  const auth = inject(Auth);
  return inject(Router).parseUrl(auth.homeFor(auth.user()?.role));
};
