import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, ApiError } from '../../core/api.service';
import { SessionStore } from '../../core/session.store';
import { I18nService } from '../../core/i18n.service';
import { Icon } from '../../shared/icon';

@Component({
  selector: 'app-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, Icon],
  template: `
    <section
      class="flex h-full min-h-[calc(100vh-2rem)] flex-col gap-6 rounded-xl bg-surface p-5 shadow-[0_4px_24px_rgba(27,58,40,0.06)] md:p-8"
    >
      <div class="flex flex-col gap-1">
        <h1 class="font-heading text-3xl font-semibold text-text">
          {{ t('settings-title') }}
        </h1>
        <p class="font-body text-sm text-text-secondary">
          {{ t('settings-subtitle') }}
        </p>
      </div>

      <form class="flex max-w-md flex-col gap-4" (ngSubmit)="save()" #form="ngForm">
        <label class="flex flex-col gap-2 font-body text-[13px] font-medium text-text">
          {{ t('field-email') }}
          <input
            readonly
            [ngModel]="session.user()?.login"
            name="login"
            class="h-12 w-full rounded-md border-0 bg-input px-4 font-body text-sm text-text-muted"
          />
        </label>

        <label class="flex flex-col gap-2 font-body text-[13px] font-medium text-text">
          {{ t('field-first-name') }}
          <input
            name="firstName"
            required
            [(ngModel)]="firstName"
            class="h-12 w-full rounded-md border-0 bg-input px-4 font-body text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </label>

        <label class="flex flex-col gap-2 font-body text-[13px] font-medium text-text">
          {{ t('field-last-name') }}
          <input
            name="lastName"
            required
            [(ngModel)]="lastName"
            class="h-12 w-full rounded-md border-0 bg-input px-4 font-body text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </label>

        <label class="flex flex-col gap-2 font-body text-[13px] font-medium text-text">
          {{ t('settings-language') }}
          <select
            name="language"
            [ngModel]="locale()"
            (ngModelChange)="setLang($event)"
            class="h-12 w-full rounded-md border-0 bg-input px-4 font-body text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="en">English</option>
            <option value="ru">Русский</option>
          </select>
        </label>

        <div class="mt-2 h-px bg-border"></div>

        <label class="flex flex-col gap-2 font-body text-[13px] font-medium text-text">
          {{ t('settings-current-password') }}
          <input
            name="currentPassword"
            type="password"
            autocomplete="current-password"
            [placeholder]="t('settings-current-password-placeholder')"
            [(ngModel)]="currentPassword"
            class="h-12 w-full rounded-md border-0 bg-input px-4 font-body text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </label>

        <label class="flex flex-col gap-2 font-body text-[13px] font-medium text-text">
          {{ t('settings-new-password') }}
          <input
            name="newPassword"
            type="password"
            autocomplete="new-password"
            [placeholder]="t('settings-new-password-placeholder')"
            [(ngModel)]="newPassword"
            class="h-12 w-full rounded-md border-0 bg-input px-4 font-body text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </label>

        @if (error(); as message) {
          <p class="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {{ message }}
          </p>
        }

        @if (saved()) {
          <p
            class="inline-flex items-center gap-2 rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary"
          >
            <app-icon name="check-circle" extra="h-4 w-4" />
            {{ t('settings-saved') }}
          </p>
        }

        <button
          type="submit"
          [disabled]="form.invalid || busy()"
          class="mt-2 inline-flex h-12 w-fit items-center justify-center rounded-md bg-primary px-6 font-body text-[15px] font-semibold text-text-inverse hover:bg-inverse disabled:opacity-50"
        >
          {{ t('settings-save') }}
        </button>
      </form>
    </section>
  `,
})
export class SettingsPage {
  readonly session = inject(SessionStore);
  private api = inject(ApiService);
  private i18n = inject(I18nService);
  readonly locale = this.i18n.locale;

  readonly firstName = signal(this.session.user()?.first_name ?? '');
  readonly lastName = signal(this.session.user()?.last_name ?? '');
  readonly currentPassword = signal('');
  readonly newPassword = signal('');
  readonly error = signal<string | null>(null);
  readonly saved = signal(false);
  readonly busy = signal(false);

  t(key: string): string {
    return this.i18n.format(key);
  }

  setLang(lang: 'en' | 'ru'): void {
    this.i18n.setLocale(lang);
  }

  async save(): Promise<void> {
    if (this.busy()) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.saved.set(false);
    try {
      const result = await this.api.updateProfile(
        this.firstName(),
        this.lastName(),
        this.currentPassword(),
        this.newPassword(),
      );
      this.session.setUser(result.user);
      this.currentPassword.set('');
      this.newPassword.set('');
      this.saved.set(true);
    } catch (e) {
      this.error.set(
        e instanceof ApiError && e.code === 'invalid_credentials'
          ? this.t('settings-error-password')
          : this.t('error-generic'),
      );
    } finally {
      this.busy.set(false);
    }
  }
}
