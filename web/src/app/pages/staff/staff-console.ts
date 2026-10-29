import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { debounceTime } from 'rxjs';
import { Api, toApiError } from '../../core/api';
import { Auth } from '../../core/auth';
import { formatWait } from '../../core/format';
import { LiveQueue } from '../../core/live';
import { QueueEntry, StaffQueue } from '../../core/models';

const COUNTERS = ['Counter 1', 'Counter 2', 'Counter 3', 'Counter 4'];
const COUNTER_KEY = 'antri.counter';

function storedCounter(): string {
  try {
    const value = localStorage.getItem(COUNTER_KEY);
    return value && COUNTERS.includes(value) ? value : COUNTERS[0];
  } catch {
    return COUNTERS[0];
  }
}

@Component({
  selector: 'app-staff-console',
  imports: [RouterLink],
  templateUrl: './staff-console.html',
  styleUrl: './staff-console.css',
  host: { '(document:keydown)': 'onKey($event)' },
})
export class StaffConsolePage implements OnInit {
  private readonly api = inject(Api);
  private readonly live = inject(LiveQueue);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly auth = inject(Auth);

  protected readonly counters = COUNTERS;
  protected readonly formatWait = formatWait;

  protected readonly queue = signal<StaffQueue | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly actionError = signal<string | null>(null);
  protected readonly notice = signal('');
  protected readonly busy = signal(false);
  protected readonly connected = signal(true);
  protected readonly counter = signal(storedCounter());
  /** Ticks every 30 s so "waiting 12 min" stays current without refetching. */
  protected readonly now = signal(Date.now());

  protected readonly current = computed(
    () => this.queue()?.called.find((e) => e.counter === this.counter()) ?? null,
  );
  protected readonly otherCounters = computed(
    () => this.queue()?.called.filter((e) => e.counter !== this.counter()) ?? [],
  );

  ngOnInit() {
    const venueId = this.auth.user()?.venueId;
    void this.load();
    if (venueId) {
      // Customers joining and other counters calling all arrive here.
      this.live
        .watch(venueId)
        .pipe(debounceTime(150), takeUntilDestroyed(this.destroyRef))
        .subscribe(() => void this.load());
      this.destroyRef.onDestroy(this.live.onConnectionChange((up) => this.connected.set(up)));
    }
    const timer = setInterval(() => this.now.set(Date.now()), 30_000);
    this.destroyRef.onDestroy(() => clearInterval(timer));
  }

  protected async load() {
    try {
      this.queue.set(await this.api.staffQueue());
      this.loadError.set(null);
    } catch (e) {
      this.loadError.set(toApiError(e).message);
    }
  }

  protected chooseCounter(counter: string) {
    this.counter.set(counter);
    try {
      localStorage.setItem(COUNTER_KEY, counter);
    } catch {
      // ignore
    }
  }

  protected callNext() {
    return this.run(async () => {
      const { ticket } = await this.api.callNext(this.counter());
      this.notice.set(ticket ? `Calling number ${ticket.number} to ${this.counter()}` : 'Nobody is waiting right now');
    });
  }

  protected finish(entry: QueueEntry, outcome: 'SERVED' | 'NO_SHOW') {
    return this.run(async () => {
      await this.api.finish(entry.id, outcome);
      this.notice.set(outcome === 'SERVED' ? `Number ${entry.number} served` : `Number ${entry.number} marked as no-show`);
    });
  }

  protected setOpen(isOpen: boolean) {
    return this.run(async () => {
      await this.api.setOpen(isOpen);
      this.notice.set(isOpen ? 'Taking new tickets' : 'Stopped taking new tickets');
    });
  }

  protected minutesSince(iso: string): number {
    return Math.max(0, Math.floor((this.now() - new Date(iso).getTime()) / 60_000));
  }

  /** N: call next. S: served. X: no-show. Ignored while typing in a field. */
  protected onKey(event: KeyboardEvent) {
    const typing = event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable]');
    if (event.metaKey || event.ctrlKey || event.altKey || event.repeat || typing) return;
    const key = event.key.toLowerCase();
    const current = this.current();
    if (key === 'n') void this.callNext();
    else if (key === 's' && current) void this.finish(current, 'SERVED');
    else if (key === 'x' && current) void this.finish(current, 'NO_SHOW');
  }

  private async run(action: () => Promise<void>) {
    if (this.busy()) return;
    this.busy.set(true);
    this.actionError.set(null);
    try {
      await action();
      await this.load();
    } catch (e) {
      this.actionError.set(toApiError(e).message);
    } finally {
      this.busy.set(false);
    }
  }
}
