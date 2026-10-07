import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiError, ApiService } from '../../core/api.service';
import { SessionStore } from '../../core/session.store';
import { I18nService } from '../../core/i18n.service';
import { DinoLogo } from '../../shared/dino-logo';

@Component({
  selector: 'app-login',
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
        <div class="flex flex-col gap-4">
          <h1 class="whitespace-pre-line font-heading text-5xl font-semibold leading-[1.15]">
            {{ t('brand-headline') }}
          </h1>
          <p class="max-w-md font-body text-base leading-normal text-primary-soft">
            {{ t('brand-desc') }}
          </p>
        </div>
        <p class="font-body text-xs text-text-muted">{{ t('brand-footer') }}</p>
      </aside>
      <div
        class="hidden h-80 flex-col justify-end gap-4 bg-inverse px-10 pb-12 pt-10 text-text-inverse md:flex xl:hidden"
      >
        <div class="flex items-center gap-3">
          <app-dino-logo sizeClass="h-11 w-11 rounded-xl" />
          <span class="font-heading text-[22px] font-semibold">{{ t('brand-name') }}</span>
        </div>
        <p class="font-heading text-[32px] font-semibold leading-tight">
          {{ t('brand-headline') }}
        </p>
      </div>
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

        <div class="flex w-full max-w-[400px] flex-col gap-8">
          <div class="flex flex-col items-center gap-4 text-center md:hidden">
            <app-dino-logo sizeClass="h-16 w-16 rounded-2xl" />
            <div class="flex flex-col gap-1">
              <span class="font-heading text-[26px] font-semibold text-text">
                {{ t('brand-name') }}
              </span>
              <p class="font-body text-sm text-text-secondary">{{ t('brand-headline') }}</p>
            </div>
          </div>

          <form class="flex w-full flex-col gap-5" (ngSubmit)="submit()" #form="ngForm">
            <div class="flex flex-col gap-2">
              <h2 class="font-heading text-[28px] font-semibold text-text">
                {{ t('login-title') }}
              </h2>
              <p class="font-body text-sm text-text-secondary">{{ t('login-subtitle') }}</p>
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
                {{ t('login-label') }}
                <input
                  name="login"
                  required
                  autocomplete="username"
                  [placeholder]="t('login-placeholder')"
                  [(ngModel)]="login"
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
                    autocomplete="current-password"
                    placeholder="••••••••"
                    [(ngModel)]="password"
                    class="h-12 w-full rounded-md border border-border bg-input py-3.5 pl-4 pr-12 font-body text-sm text-text shadow-none placeholder:text-text-muted focus:border-primary focus:outline-none"
                  />
                  <button
                    type="button"
                    class="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text"
                    [attr.aria-label]="
                      passwordVisible() ? t('login-hide-password') : t('login-show-password')
                    "
                    (click)="passwordVisible.set(!passwordVisible())"
                  >
                    @if (passwordVisible()) {
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
                        <path
                          d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"
                        />
                        <path
                          d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"
                        />
                        <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    } @else {
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
                    }
                  </button>
                </div>
              </label>
            </div>

            <button
              type="submit"
              [disabled]="form.invalid || busy()"
              class="inline-flex h-12 w-full items-center justify-center rounded-md bg-primary px-5 font-body text-[15px] font-semibold text-text-inverse hover:bg-inverse focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              {{ t('login-submit') }}
            </button>
          </form>
        </div>
      </section>
    </div>
  `,
})
export class LoginPage {
  readonly session = inject(SessionStore);
  private api = inject(ApiService);
  private i18n = inject(I18nService);
  private router = inject(Router);

  readonly login = signal('');
  readonly password = signal('');
  readonly passwordVisible = signal(false);
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
    this.busy.set(true);
    this.error.set(null);
    try {
      const result = await this.api.login(this.login(), this.password());
      this.session.setUser(result.user);
      await this.router.navigateByUrl(!this.session.needsOnboarding() ? '/courses' : '/onboarding');
    } catch (e) {
      this.error.set(
        e instanceof ApiError && e.code === 'invalid_credentials'
          ? this.t('login-error-invalid')
          : this.t('error-generic'),
      );
    } finally {
      this.busy.set(false);
    }
  }
}
