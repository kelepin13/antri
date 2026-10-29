import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable, InjectionToken } from '@angular/core';
import { catchError, firstValueFrom, Observable, throwError } from 'rxjs';
import {
  CallNextResult,
  Session,
  StaffAccount,
  StaffInput,
  StaffQueue,
  VenueInput,
  VenueOverview,
  VenueSnapshot,
} from './models';

/**
 * Where the API lives. The default `/api` is served by the same host: the Angular
 * dev server proxies it in development and nginx proxies it in the Docker image.
 */
export const API_BASE = new InjectionToken<string>('API_BASE', { factory: () => '/api' });

/** Every API failure as `{ code, message }`, matching the backend's error shape. */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (error instanceof HttpErrorResponse) {
    const body = error.error as { code?: string; message?: string } | null;
    if (body && typeof body.code === 'string') {
      return new ApiError(body.code, body.message ?? 'Request failed', error.status);
    }
    if (error.status === 0) {
      return new ApiError('NETWORK', "Can't reach the server. Check your connection and try again.", 0);
    }
    return new ApiError(`HTTP_${error.status}`, `Request failed (${error.status})`, error.status);
  }
  return new ApiError('UNKNOWN', String(error), 0);
}

@Injectable({ providedIn: 'root' })
export class Api {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE);

  login(email: string, password: string) {
    return this.call(this.http.post<Session>(`${this.base}/auth/login`, { email, password }));
  }

  venue(venueId: string) {
    return this.call(this.http.get<VenueSnapshot>(`${this.base}/venues/${venueId}`));
  }

  // ---- Staff ----

  staffQueue() {
    return this.call(this.http.get<StaffQueue>(`${this.base}/staff/queue`));
  }

  callNext(counter: string) {
    return this.call(this.http.post<CallNextResult>(`${this.base}/staff/call-next`, { counter }));
  }

  finish(ticketId: string, outcome: 'SERVED' | 'NO_SHOW') {
    return this.call(this.http.post<unknown>(`${this.base}/staff/tickets/${ticketId}/finish`, { outcome }));
  }

  setOpen(isOpen: boolean) {
    return this.call(this.http.patch<VenueSnapshot>(`${this.base}/staff/venue`, { isOpen }));
  }

  // ---- Admin ----

  overview() {
    return this.call(this.http.get<VenueOverview[]>(`${this.base}/admin/overview`));
  }

  createVenue(input: VenueInput) {
    return this.call(this.http.post<VenueSnapshot>(`${this.base}/admin/venues`, input));
  }

  updateVenue(venueId: string, input: Partial<VenueInput> & { isOpen?: boolean }) {
    return this.call(this.http.patch<VenueSnapshot>(`${this.base}/admin/venues/${venueId}`, input));
  }

  staffAccounts() {
    return this.call(this.http.get<StaffAccount[]>(`${this.base}/admin/staff`));
  }

  createStaff(input: StaffInput) {
    return this.call(this.http.post<StaffAccount>(`${this.base}/admin/staff`, input));
  }

  deleteStaff(staffId: string) {
    return this.call(this.http.delete<void>(`${this.base}/admin/staff/${staffId}`));
  }

  private call<T>(request: Observable<T>): Promise<T> {
    return firstValueFrom(request.pipe(catchError((e) => throwError(() => toApiError(e)))));
  }
}
