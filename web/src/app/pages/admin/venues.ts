import { Component, computed, DestroyRef, ElementRef, inject, OnInit, signal, viewChild } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { debounceTime, merge, Subscription } from 'rxjs';
import { Api, toApiError } from '../../core/api';
import { formatWait, TIMEZONES } from '../../core/format';
import { LiveQueue } from '../../core/live';
import { VenueInput, VenueOverview } from '../../core/models';
import { HourlyBars } from '../../ui/hourly-bars';

@Component({
  selector: 'app-venues',
  imports: [ReactiveFormsModule, RouterLink, HourlyBars],
  templateUrl: './venues.html',
  styleUrl: './admin.css',
})
export class VenuesPage implements OnInit {
  private readonly api = inject(Api);
  private readonly live = inject(LiveQueue);
  private readonly destroyRef = inject(DestroyRef);
  private liveSub?: Subscription;

  protected readonly formatWait = formatWait;
  protected readonly venues = signal<VenueOverview[] | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly rowBusy = signal<string | null>(null);

  protected readonly totals = computed(() => {
    const list = this.venues() ?? [];
    return {
      venues: list.length,
      waiting: list.reduce((sum, v) => sum + v.waitingCount, 0),
      issued: list.reduce((sum, v) => sum + v.today.issued, 0),
    };
  });

  // ---- Add / edit panel ----
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('editor');
  protected readonly editing = signal<VenueOverview | null>(null);
  /** Known zones, plus the venue's own if it was set to something else. */
  protected readonly timezoneOptions = computed(() => {
    const current = this.editing()?.timezone;
    return current && !TIMEZONES.includes(current) ? [current, ...TIMEZONES] : TIMEZONES;
  });
  protected readonly saving = signal(false);
  protected readonly formError = signal<string | null>(null);
  protected readonly form = inject(FormBuilder).nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(80)]],
    category: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(40)]],
    address: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(160)]],
    timezone: ['Asia/Jakarta', Validators.required],
    avgServiceMinutes: [10, [Validators.required, Validators.min(1), Validators.max(240)]],
    notifyAhead: [3, [Validators.required, Validators.min(0), Validators.max(20)]],
  });

  ngOnInit() {
    void this.load();
    this.destroyRef.onDestroy(() => this.liveSub?.unsubscribe());
  }

  protected async load() {
    try {
      const list = await this.api.overview();
      const known = new Set((this.venues() ?? []).map((v) => v.id));
      this.venues.set(list);
      this.loadError.set(null);
      if (list.some((v) => !known.has(v.id)) || !this.liveSub) this.watchAll(list);
    } catch (e) {
      this.loadError.set(toApiError(e).message);
    }
  }

  /** Live counts on every row; today's totals are refreshed a moment after activity settles. */
  private watchAll(list: VenueOverview[]) {
    this.liveSub?.unsubscribe();
    const updates = merge(...list.map((v) => this.live.watch(v.id)));
    this.liveSub = updates.subscribe((snapshot) =>
      this.venues.update((rows) => rows?.map((row) => (row.id === snapshot.id ? { ...row, ...snapshot } : row)) ?? rows),
    );
    this.liveSub.add(updates.pipe(debounceTime(3000)).subscribe(() => void this.load()));
  }

  protected async toggleOpen(venue: VenueOverview) {
    this.rowBusy.set(venue.id);
    try {
      await this.api.updateVenue(venue.id, { isOpen: !venue.isOpen });
      await this.load();
    } catch (e) {
      this.loadError.set(toApiError(e).message);
    } finally {
      this.rowBusy.set(null);
    }
  }

  protected openEditor(venue: VenueOverview | null) {
    this.editing.set(venue);
    this.formError.set(null);
    this.form.reset(
      venue
        ? {
            name: venue.name,
            category: venue.category,
            address: venue.address,
            timezone: venue.timezone,
            avgServiceMinutes: venue.configuredServiceMinutes,
            notifyAhead: venue.notifyAhead,
          }
        : undefined,
    );
    this.dialog()?.nativeElement.showModal();
  }

  protected closeEditor() {
    this.dialog()?.nativeElement.close();
  }

  protected async save() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.formError.set(null);
    try {
      const venue = this.editing();
      if (venue) {
        // Only send what the admin changed.
        const changed: Partial<VenueInput> = {};
        for (const [key, control] of Object.entries(this.form.controls)) {
          if (control.dirty) (changed as Record<string, unknown>)[key] = control.value;
        }
        if (Object.keys(changed).length) await this.api.updateVenue(venue.id, changed);
      } else {
        await this.api.createVenue(this.form.getRawValue());
      }
      this.closeEditor();
      await this.load();
    } catch (e) {
      this.formError.set(toApiError(e).message);
    } finally {
      this.saving.set(false);
    }
  }
}
