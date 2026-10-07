import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiError, ApiService } from '../../core/api.service';
import { SessionStore } from '../../core/session.store';
import { I18nService } from '../../core/i18n.service';
import { DinoLogo } from '../../shared/dino-logo';

@Component({
  selector: 'app-setup',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, DinoLogo],
  template: `
    <div class="flex min-h-screen flex-col bg-bg xl:flex-row">
      <aside
        class="hidden w-[560px] shrink-0 flex-col justify-between bg-inverse p-12 text-text-inverse xl:flex"
      >
        <div class="flex items-center gap-3">
          <app-dino-logo sizeClass="h-12 w-12 rounded-[14px]" />
          <span class="font-heading text-2xl font-semibold">{{ t('brand-name') }}</span>
        </div>
        <div class="flex flex-col gap-6">
          <span
            class="inline-flex w-fit items-center rounded-full bg-primary px-3 py-1 font-body text-xs font-medium text-text-inverse"
          >
            {{ t('setup-badge') }}
          </span>
          <h1 class="font-heading text-4xl font-semibold leading-[1.15]">
            {{ t('setup-brand-headline') }}
          </h1>
          <p class="max-w-md font-body text-base leading-normal text-primary-soft">
            {{ t('setup-brand-desc') }}
          </p>
          <ol class="flex flex-col gap-3 font-body text-sm text-text-inverse/80">
            <li class="flex gap-3">
              <span class="font-semibold text-primary-soft">1.</span>{{ t('setup-step-1') }}
            </li>
            <li class="flex gap-3">
              <span class="font-semibold text-primary-soft">2.</span>{{ t('setup-step-2') }}
            </li>
            <li class="flex gap-3">
              <span class="font-semibold text-primary-soft">3.</span>{{ t('setup-step-3') }}
            </li>
          </ol>
        </div>
        <p class="font-body text-xs text-text-muted">{{ t('setup-brand-footer') }}</p>
      </aside>
      <section
        class="relative flex flex-1 flex-col items-center justify-center bg-surface px-6 py-8 md:px-16 md:py-12"
      >
        <div
          class="absolute right-4 top-4 flex items-center gap-1 text-sm text-text-muted md:right-6 md:top-6"
        >
          <button type="button" [class]="langClass('en')" (click)="setLang('en')">
            {{ t('nav-lang-en') }}
          </button>
          <span class="text-border">/</span>
          <button type="button" [class]="langClass('ru')" (click)="setLang('ru')">
            {{ t('nav-lang-ru') }}
          </button>
        </div>

        <div class="flex w-full max-w-[420px] flex-col gap-8">
          <div class="flex flex-col items-center gap-4 text-center xl:hidden">
            <app-dino-logo sizeClass="h-16 w-16 rounded-2xl" />
            <p class="font-body text-sm text-text-secondary">{{ t('setup-mobile-sub') }}</p>
          </div>

          <form class="flex w-full flex-col gap-5" (ngSubmit)="submit()" #form="ngForm">
            <div class="flex flex-col gap-2">
              <h2 class="font-heading text-[28px] font-semibold text-text">
                {{ t('setup-title') }}
              </h2>
              <p class="font-body text-sm text-text-secondary">{{ t('setup-subtitle') }}</p>
            </div>

            @if (error(); as message) {
              <p
                class="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
              >
                {{ message }}
              </p>
            }

            <div class="flex flex-col gap-4">
              <label class="flex flex-col gap-2 font-body text-[13px] font-medium text-text">
                {{ t('field-first-name') }}
                <input
                  name="firstName"
                  required
                  [placeholder]="t('setup-name-placeholder')"
                  [(ngModel)]="firstName"
                  class="h-12 w-full rounded-md border border-border bg-input px-4 font-body text-sm text-text shadow-none placeholder:text-text-muted focus:border-primary focus:outline-none"
                />
              </label>

              <label class="flex flex-col gap-2 font-body text-[13px] font-medium text-text">
                {{ t('field-last-name') }}
                <input
                  name="lastName"
                  required
                  [placeholder]="t('setup-last-name-placeholder')"
                  [(ngModel)]="lastName"
                  class="h-12 w-full rounded-md border border-border bg-input px-4 font-body text-sm text-text shadow-none placeholder:text-text-muted focus:border-primary focus:outline-none"
                />
              </label>

              <label class="flex flex-col gap-2 font-body text-[13px] font-medium text-text">
                {{ t('field-email') }}
                <input
                  name="email"
                  type="email"
                  required
                  [placeholder]="t('setup-email-placeholder')"
                  [(ngModel)]="email"
                  class="h-12 w-full rounded-md border border-border bg-input px-4 font-body text-sm text-text shadow-none placeholder:text-text-muted focus:border-primary focus:outline-none"
                />
              </label>

              <label class="flex flex-col gap-2 font-body text-[13px] font-medium text-text">
                {{ t('login-password') }}
                <div class="relative">
                  <input
                    name="password"
                    [type]="passwordVisible() ? 'text' : 'password'"
                    required
                    autocomplete="new-password"
                    [placeholder]="t('setup-password-placeholder')"
                    [(ngModel)]="password"
                    class="h-12 w-full rounded-md border border-border bg-input py-3.5 pl-4 pr-12 font-body text-sm text-text shadow-none placeholder:text-text-muted focus:border-primary focus:outline-none"
                  />
                  <button
                    type="button"
                    class="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text"
                    (click)="passwordVisible.set(!passwordVisible())"
                  >
                    <svg
                      class="h-[18px] w-[18px]"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  </button>
                </div>
              </label>

              <label class="flex flex-col gap-2 font-body text-[13px] font-medium text-text">
                {{ t('setup-confirm-label') }}
                <input
                  name="confirm"
                  [type]="confirmVisible() ? 'text' : 'password'"
                  required
                  autocomplete="new-password"
                  [placeholder]="t('setup-confirm-placeholder')"
                  [(ngModel)]="confirm"
                  class="h-12 w-full rounded-md border border-border bg-input py-3.5 pl-4 pr-12 font-body text-sm text-text shadow-none placeholder:text-text-muted focus:border-primary focus:outline-none"
                />
              </label>
            </div>

            <button
              type="submit"
              [disabled]="form.invalid || busy()"
              class="inline-flex h-12 w-full items-center justify-center rounded-md bg-primary px-5 font-body text-[15px] font-semibold text-text-inverse hover:bg-inverse focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              {{ t('setup-submit') }}
            </button>

            <p class="font-body text-xs text-text-muted">
              {{ t('setup-note') }}
            </p>
          </form>
        </div>
      </section>
    </div>
  `,
})
export class SetupPage {
  readonly session = inject(SessionStore);
  private api = inject(ApiService);
  private i18n = inject(I18nService);
  private router = inject(Router);

  readonly firstName = signal('');
  readonly lastName = signal('');
  readonly email = signal('');
  readonly password = signal('');
  readonly confirm = signal('');
  readonly passwordVisible = signal(false);
  readonly confirmVisible = signal(false);
  readonly error = signal<string | null>(null);
  readonly busy = signal(false);

  t(key: string): string {
    return this.i18n.format(key);
  }

  setLang(lang: 'en' | 'ru'): void {
    this.i18n.setLocale(lang);
  }

  langClass(lang: 'en' | 'ru'): string {
    return this.i18n.locale() === lang ? 'font-semibold text-text' : 'hover:text-text';
  }

  async submit(): Promise<void> {
    if (this.busy()) {
      return;
    }
    this.error.set(null);
    if (this.password().length < 8) {
      this.error.set(this.t('setup-error-short'));
      return;
    }
    if (this.password() !== this.confirm()) {
      this.error.set(this.t('setup-error-mismatch'));
      return;
    }
    this.busy.set(true);
    try {
      const result = await this.api.setup(
        this.email().trim(),
        this.password(),
        this.firstName().trim(),
        this.lastName().trim(),
      );
      this.session.setUser(result.user);
      this.session.setHasAdmin(true);
      await this.router.navigateByUrl(this.session.needsOnboarding() ? '/onboarding' : '/courses');
    } catch (e) {
      this.error.set(
        e instanceof ApiError && e.code === 'admin_exists'
          ? this.t('setup-error-exists')
          : this.t('setup-error-failed'),
      );
    } finally {
      this.busy.set(false);
    }
  }
}
