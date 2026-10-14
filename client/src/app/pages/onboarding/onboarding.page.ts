import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { SessionStore } from '../../core/session.store';
import { I18nService } from '../../core/i18n.service';
import { DinoLogo } from '../../shared/dino-logo';
import { Icon } from '../../shared/icon';

@Component({
  selector: 'app-onboarding',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, DinoLogo, Icon],
  template: `
    <div class="flex min-h-screen items-center justify-center bg-surface px-5 py-8 md:bg-bg">
      <section class="w-full max-w-[480px] bg-surface md:rounded-xl md:p-10">
        <div class="mb-6 flex flex-col items-center gap-3 md:flex-row">
          <app-dino-logo sizeClass="h-14 w-14 rounded-lg md:h-10 md:w-10 md:rounded-md" />
          <span class="hidden font-heading text-lg font-semibold text-text md:block">
            {{ t('brand-name') }}
          </span>
        </div>
        <h1
          class="text-center font-heading text-2xl font-semibold text-text md:text-left md:text-[28px]"
        >
          {{ t('onboarding-title') }}
        </h1>
        <p class="mt-2 text-center font-body text-sm text-text-secondary md:text-left">
          {{ t('onboarding-subtitle') }}
        </p>

        <form class="mt-6 flex flex-col gap-4" (ngSubmit)="submit()" #form="ngForm">
          <label class="flex flex-col gap-1.5 font-body text-[13px] font-medium text-text">
            {{ t('field-email') }}
            <div class="relative">
              <input
                type="email"
                readonly
                [ngModel]="session.user()?.login"
                name="email"
                class="h-11 w-full rounded-md border border-border bg-input py-3 pl-4 pr-10 font-body text-sm text-text-muted"
              />
              <span
                class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-muted"
              >
                <app-icon name="lock" extra="h-4 w-4" />
              </span>
            </div>
          </label>

          <label class="flex flex-col gap-1.5 font-body text-[13px] font-medium text-text">
            {{ t('field-first-name') }}
            <input
              type="text"
              name="firstName"
              required
              [(ngModel)]="firstName"
              class="h-11 w-full rounded-md border border-border bg-input px-4 font-body text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </label>

          <label class="flex flex-col gap-1.5 font-body text-[13px] font-medium text-text">
            {{ t('field-last-name') }}
            <input
              type="text"
              name="lastName"
              required
              [(ngModel)]="lastName"
              class="h-11 w-full rounded-md border border-border bg-input px-4 font-body text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </label>

          @if (error()) {
            <p role="alert" class="rounded-md bg-danger/10 p-3 text-sm text-danger">
              {{ error() }}
            </p>
          }
          <button
            type="submit"
            [disabled]="form.invalid || busy()"
            class="mt-2 inline-flex h-12 w-full items-center justify-center rounded-md bg-primary font-body text-[15px] font-semibold text-text-inverse hover:bg-inverse"
          >
            {{ t('onboarding-continue') }}
          </button>
        </form>
      </section>
    </div>
  `,
})
export class OnboardingPage {
  readonly session = inject(SessionStore);
  private api = inject(ApiService);
  private i18n = inject(I18nService);
  private router = inject(Router);

  readonly error = signal<string | null>(null);
  readonly firstName = signal(this.session.user()?.first_name ?? '');
  readonly lastName = signal(this.session.user()?.last_name ?? '');
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
    try {
      const result = await this.api.onboarding(this.firstName(), this.lastName());
      this.session.setUser(result.user);
      await this.router.navigateByUrl('/courses');
    } catch {
      this.error.set(this.t('error-generic'));
    } finally {
      this.busy.set(false);
    }
  }
}
