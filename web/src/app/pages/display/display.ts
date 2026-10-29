import { Component, computed, DestroyRef, effect, inject, input, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Api, toApiError } from '../../core/api';
import { formatWait } from '../../core/format';
import { LiveQueue } from '../../core/live';
import { VenueSnapshot } from '../../core/models';

/**
 * The waiting-room TV: who is being served where, and how long the line is.
 * Public (no sign-in), updates live, and recovers by itself after network drops.
 */
@Component({
  selector: 'app-display',
  templateUrl: './display.html',
  styleUrl: './display.css',
})
export class DisplayPage implements OnInit {
  /** Bound from the route `display/:venueId`. */
  readonly venueId = input.required<string>();

  private readonly api = inject(Api);
  private readonly live = inject(LiveQueue);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly formatWait = formatWait;
  protected readonly venue = signal<VenueSnapshot | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly connected = signal(true);
  protected readonly soundOn = signal(false);
  protected readonly clock = signal(new Date());

  /** Most recently called first (the API orders by call time). */
  protected readonly newest = computed(() => this.venue()?.nowServing[0] ?? null);
  protected readonly earlier = computed(() => this.venue()?.nowServing.slice(1, 5) ?? []);

  private audio?: AudioContext;
  private lastCalled: string | null = null;

  constructor() {
    // Chime once whenever a new number is called.
    effect(() => {
      const n = this.newest();
      const key = n ? `${n.number}:${n.counter}` : null;
      if (key && this.lastCalled !== null && key !== this.lastCalled && this.soundOn()) this.chime();
      this.lastCalled = key ?? '';
    });
  }

  ngOnInit() {
    void this.loadInitial();
    this.live
      .watch(this.venueId())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((snapshot) => {
        this.venue.set(snapshot);
        this.error.set(null);
      });
    this.destroyRef.onDestroy(this.live.onConnectionChange((up) => this.connected.set(up)));
    const timer = setInterval(() => this.clock.set(new Date()), 10_000);
    this.destroyRef.onDestroy(() => {
      clearInterval(timer);
      void this.audio?.close();
    });
  }

  protected async enableSound() {
    this.audio ??= new AudioContext();
    await this.audio.resume();
    this.soundOn.set(true);
    this.chime();
  }

  protected toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.();
  }

  private async loadInitial() {
    try {
      this.venue.set(await this.api.venue(this.venueId()));
    } catch (e) {
      const error = toApiError(e);
      this.error.set(
        error.code === 'VENUE_NOT_FOUND' || error.status === 400
          ? 'This screen link is not valid. Open the TV screen again from the staff console.'
          : error.message,
      );
    }
  }

  /** Two soft tones, like a counter bell. */
  private chime() {
    const ctx = this.audio;
    if (!ctx) return;
    [880, 660].forEach((frequency, i) => {
      const start = ctx.currentTime + i * 0.28;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.6);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.65);
    });
  }
}
