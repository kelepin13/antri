import { Component, ElementRef, inject, OnInit, signal, viewChild } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Api, toApiError } from '../../core/api';
import { StaffAccount, VenueOverview } from '../../core/models';

@Component({
  selector: 'app-staff-accounts',
  imports: [ReactiveFormsModule],
  templateUrl: './staff-accounts.html',
  styleUrl: './admin.css',
})
export class StaffAccountsPage implements OnInit {
  private readonly api = inject(Api);

  protected readonly staff = signal<StaffAccount[] | null>(null);
  protected readonly venues = signal<VenueOverview[]>([]);
  protected readonly loadError = signal<string | null>(null);
  protected readonly removing = signal<string | null>(null);

  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('editor');
  protected readonly saving = signal(false);
  protected readonly formError = signal<string | null>(null);
  protected readonly form = inject(FormBuilder).nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(80)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(72)]],
    venueId: ['', Validators.required],
  });

  ngOnInit() {
    void this.load();
  }

  protected async load() {
    try {
      const [staff, venues] = await Promise.all([this.api.staffAccounts(), this.api.overview()]);
      this.staff.set(staff);
      this.venues.set(venues);
      this.loadError.set(null);
    } catch (e) {
      this.loadError.set(toApiError(e).message);
    }
  }

  protected openEditor() {
    this.formError.set(null);
    this.form.reset({ venueId: this.venues()[0]?.id ?? '' });
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
      await this.api.createStaff(this.form.getRawValue());
      this.closeEditor();
      await this.load();
    } catch (e) {
      this.formError.set(toApiError(e).message);
    } finally {
      this.saving.set(false);
    }
  }

  protected async remove(account: StaffAccount) {
    if (!confirm(`Remove ${account.name}'s account? They will no longer be able to sign in.`)) return;
    this.removing.set(account.id);
    try {
      await this.api.deleteStaff(account.id);
      await this.load();
    } catch (e) {
      this.loadError.set(toApiError(e).message);
    } finally {
      this.removing.set(null);
    }
  }
}
