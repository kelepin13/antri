import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, UrlTree } from '@angular/router';
import { toApiError } from './api';
import { Auth, requireRole } from './auth';
import { formatWait } from './format';
import { User } from './models';

describe('formatWait', () => {
  it('reads naturally across ranges', () => {
    expect(formatWait(0)).toBe('No wait');
    expect(formatWait(8)).toBe('~8 min');
    expect(formatWait(60)).toBe('~1h');
    expect(formatWait(95)).toBe('~1h 35m');
    expect(formatWait(null)).toBe('No data yet');
  });
});

describe('toApiError', () => {
  it("keeps the backend's error code and message", () => {
    const error = toApiError(
      new HttpErrorResponse({ status: 409, error: { code: 'VENUE_CLOSED', message: 'Not taking tickets' } }),
    );
    expect(error).toMatchObject({ code: 'VENUE_CLOSED', message: 'Not taking tickets', status: 409 });
  });

  it('turns a dropped connection into a readable network error', () => {
    expect(toApiError(new HttpErrorResponse({ status: 0 })).code).toBe('NETWORK');
  });
});

describe('requireRole', () => {
  function runGuard(user: User | null) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: Auth,
          useValue: {
            user: () => user,
            homeFor: (role?: string) => (role === 'ADMIN' ? '/admin' : role === 'STAFF' ? '/staff' : '/login'),
          },
        },
      ],
    });
    const result = TestBed.runInInjectionContext(() => requireRole('ADMIN')({} as never, {} as never));
    return result instanceof UrlTree ? TestBed.inject(Router).serializeUrl(result) : result;
  }

  const user = (role: User['role']): User => ({ id: '1', email: 'a@b.c', name: 'A', role, venueId: null });

  it('lets the right role in', () => {
    expect(runGuard(user('ADMIN'))).toBe(true);
  });

  it("sends other roles to their own home, and guests to sign in", () => {
    expect(runGuard(user('STAFF'))).toBe('/staff');
    expect(runGuard(null)).toBe('/login');
  });
});
