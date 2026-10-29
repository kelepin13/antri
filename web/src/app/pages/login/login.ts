import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { toApiError } from '../../core/api';
import { Auth } from '../../core/auth';

const DEMO_ACCOUNTS = [
  { label: 'Clinic staff', email: 'staff.clinic@antri.dev' },
  { label: 'Admin', email: 'admin@antri.dev' },
];

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class LoginPage {
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);

  protected readonly demos = DEMO_ACCOUNTS;
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly form = inject(FormBuilder).nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  useDemo(email: string) {
    this.form.setValue({ email, password: 'password123' });
    this.error.set(null);
  }

  async submit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      const { email, password } = this.form.getRawValue();
      const session = await this.auth.login(email, password);
      if (session.user.role === 'CUSTOMER') {
        this.auth.logout();
        this.error.set('This dashboard is for venue staff and admins. Customers take a number in the Antri mobile app.');
        return;
      }
      await this.router.navigateByUrl(this.auth.homeFor(session.user.role));
    } catch (e) {
      this.error.set(toApiError(e).message);
    } finally {
      this.busy.set(false);
    }
  }
}
