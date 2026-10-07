import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AccountSession } from '../../core/api.types';
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
      <section
        class="flex max-w-2xl flex-col gap-4 border-t border-border pt-6"
        aria-labelledby="sessions-title"
      >
        <h2 id="sessions-title" class="font-heading text-xl font-semibold text-text">
          {{ t('sessions-title') }}
        </h2>
        <p class="text-sm text-text-secondary">{{ t('sessions-subtitle') }}</p>
        <div class="flex flex-wrap gap-3">
          <button
            type="button"
            (click)="loadSessions()"
            [disabled]="sessionsBusy()"
            class="rounded-md border border-border px-4 py-2 text-sm text-text disabled:opacity-50"
          >
            {{ t('sessions-refresh') }}
          </button>
          <button
            type="button"
            (click)="revokeOthers()"
            [disabled]="sessionsBusy() || !hasOtherSessions()"
            class="rounded-md border border-danger/30 px-4 py-2 text-sm text-danger disabled:opacity-50"
          >
            {{ t('sessions-revoke-others') }}
          </button>
        </div>
        @if (sessionsError()) {
          <p role="alert" class="text-sm text-danger">{{ sessionsError() }}</p>
        }
        @if (sessionsBusy()) {
          <p role="status" class="text-sm text-text-secondary">{{ t('sessions-loading') }}</p>
        }
        <ul class="flex flex-col gap-3" [attr.aria-busy]="sessionsBusy()">
          @for (item of sessions(); track item.id) {
            <li
              class="flex flex-col gap-3 rounded-md border border-border p-4 sm:flex-row sm:items-start sm:justify-between"
            >
              <div class="min-w-0 space-y-2">
                @if (item.current) {
                  <p class="text-sm font-semibold text-primary">{{ t('sessions-current') }}</p>
                }
                <p class="break-words text-sm text-text">
                  {{ item.user_agent || t('sessions-unknown-browser') }}
                </p>
                @if (item.created_at) {
                  <p class="text-xs text-text-secondary">
                    {{ t('sessions-created') }} {{ sessionDate(item.created_at) }}
                  </p>
                }
                <p class="text-xs text-text-secondary">
                  {{ t('sessions-expires') }} {{ sessionDate(item.expires_at) }}
                </p>
              </div>
              <button
                type="button"
                (click)="revoke(item)"
                [disabled]="sessionsBusy()"
                class="shrink-0 self-start rounded-md border border-danger/30 px-3 py-2 text-sm text-danger disabled:opacity-50"
              >
                {{ t(item.current ? 'sessions-sign-out' : 'sessions-revoke') }}
              </button>
            </li>
          }
        </ul>
      </section>
      <footer class="mt-auto border-t border-border pt-4 font-body text-xs text-text-muted">
        {{ t('settings-software-version') }}:
        <span class="break-all font-mono" data-testid="software-version">{{
          session.softwareVersion() || '—'
        }}</span>
      </footer>
    </section>
  `,
})
export class SettingsPage {
  readonly session = inject(SessionStore);
  private api = inject(ApiService);
  private i18n = inject(I18nService);
  private router = inject(Router);
  readonly sessions = signal<AccountSession[]>([]);
  readonly sessionsBusy = signal(false);
  readonly sessionsError = signal<string | null>(null);

  constructor() {
    void this.loadSessions();
  }

  hasOtherSessions(): boolean {
    return this.sessions().some((item) => !item.current);
  }

  sessionDate(timestamp: number): string {
    return new Date(timestamp * 1000).toLocaleString(this.locale());
  }

  async loadSessions(): Promise<void> {
    if (this.sessionsBusy()) return;
    this.sessionsBusy.set(true);
    this.sessionsError.set(null);
    try {
      this.sessions.set((await this.api.sessions()).sessions);
    } catch {
      this.sessionsError.set(this.t('error-generic'));
    } finally {
      this.sessionsBusy.set(false);
    }
  }

  async revoke(item: AccountSession): Promise<void> {
    if (this.sessionsBusy()) return;
    this.sessionsBusy.set(true);
    this.sessionsError.set(null);
    try {
      await this.api.revokeSession(item.id);
      this.sessions.update((items) => items.filter((entry) => entry.id !== item.id));
      if (item.current) {
        this.session.clear();
        await this.router.navigateByUrl('/login');
      }
    } catch {
      this.sessionsError.set(this.t('error-generic'));
    } finally {
      this.sessionsBusy.set(false);
    }
  }

  async revokeOthers(): Promise<void> {
    if (this.sessionsBusy()) return;
    this.sessionsBusy.set(true);
    this.sessionsError.set(null);
    try {
      await this.api.revokeOtherSessions();
      this.sessions.update((items) => items.filter((item) => item.current));
    } catch {
      this.sessionsError.set(this.t('error-generic'));
    } finally {
      this.sessionsBusy.set(false);
    }
  }
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
