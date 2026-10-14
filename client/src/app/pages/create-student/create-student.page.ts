import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { I18nService } from '../../core/i18n.service';
import { Icon } from '../../shared/icon';
import { Spinner } from '../../shared/loading';

@Component({
  selector: 'app-create-student',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, Icon, RouterLink, Spinner],
  template: `
    <section class="design-page">
      <div class="flex items-center justify-between gap-4">
        <a
          routerLink="/users"
          class="inline-flex items-center gap-2 font-body text-[13px] text-text-secondary hover:text-text"
        >
          <app-icon name="arrow-left" extra="h-4 w-4" />
          {{ t('students-back') }}
        </a>
      </div>

      <div class="flex flex-col gap-2">
        <h1 class="font-heading text-[26px] font-semibold text-text">
          {{ t('students-new-title') }}
        </h1>
        <p class="font-body text-sm text-text-secondary">
          {{ t('students-new-subtitle') }}
        </p>
      </div>

      <form class="flex max-w-md flex-col gap-4" (ngSubmit)="submit()" #form="ngForm">
        <label class="flex flex-col gap-2 font-body text-[13px] font-medium text-text">
          {{ t('field-email') }}
          <input
            name="login"
            type="email"
            required
            [placeholder]="t('students-login-placeholder')"
            [(ngModel)]="login"
            class="h-11 w-full rounded-md border border-border bg-input px-4 font-body text-sm text-text placeholder:text-text-muted focus:border-primary focus:outline-none"
          />
        </label>

        <label class="flex flex-col gap-2 font-body text-[13px] font-medium text-text">
          {{ t('students-password-hint') }}
          <input
            name="password"
            [placeholder]="t('students-password-placeholder')"
            [(ngModel)]="password"
            class="h-11 w-full rounded-md border border-border bg-input px-4 font-body text-sm text-text placeholder:text-text-muted focus:border-primary focus:outline-none"
          />
        </label>

        @if (error()) {
          <p role="alert" class="rounded-md bg-danger/10 p-3 text-sm text-danger">{{ error() }}</p>
        }
        @if (created()) {
          <p role="status" class="text-sm text-primary">{{ t('students-created') }}</p>
        }
        @if (temporaryPassword(); as pwd) {
          <div class="flex items-center justify-between gap-3 rounded-md bg-inverse px-4 py-3">
            <code class="font-mono text-sm text-text-inverse">{{ pwd }}</code>
            <button
              type="button"
              class="rounded-md p-1.5 text-text-inverse transition-colors hover:bg-white/10"
              (click)="copy(pwd)"
            >
              <app-icon name="copy" extra="h-4 w-4 text-text-inverse" />
            </button>
          </div>
        }

        <div class="flex items-center gap-2">
          <button
            type="submit"
            [disabled]="form.invalid || busy()"
            class="inline-flex h-12 items-center justify-center rounded-md bg-primary px-5 font-body text-[15px] font-semibold text-text-inverse hover:bg-inverse disabled:opacity-50"
          >
            @if (busy()) {
              <app-spinner />
            }
            {{ t('students-create') }}
          </button>
          @if (temporaryPassword()) {
            <a
              routerLink="/users"
              class="inline-flex h-12 items-center rounded-md border border-border px-5 font-body text-sm font-medium text-text hover:bg-input"
            >
              {{ t('students-back-to-users') }}
            </a>
          }
        </div>
      </form>
    </section>
  `,
})
export class CreateStudentPage {
  private api = inject(ApiService);
  private i18n = inject(I18nService);

  readonly error = signal<string | null>(null);
  readonly created = signal(false);
  readonly login = signal('');
  readonly password = signal('');
  readonly temporaryPassword = signal('');
  readonly busy = signal(false);

  t(key: string): string {
    return this.i18n.format(key);
  }

  async submit(): Promise<void> {
    if (this.busy()) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.created.set(false);
    this.temporaryPassword.set('');
    try {
      const password = this.password().trim();
      const result = await this.api.createStudent(
        this.login().trim(),
        password ? password : undefined,
      );
      this.temporaryPassword.set(result.temporary_password ?? '');
      this.created.set(true);
    } catch {
      this.error.set(this.t('error-generic'));
    } finally {
      this.busy.set(false);
    }
  }

  copy(value: string): void {
    void navigator.clipboard?.writeText(value);
  }
}
