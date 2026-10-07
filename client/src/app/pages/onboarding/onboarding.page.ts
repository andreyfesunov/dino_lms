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
    <div class="flex min-h-screen items-center justify-center bg-bg px-4 py-10">
      <section
        class="w-full max-w-[440px] rounded-xl bg-surface p-8 shadow-[0_4px_24px_rgba(27,58,40,0.08)]"
      >
        <div class="mb-6 flex items-center gap-3">
          <app-dino-logo sizeClass="h-10 w-10 rounded-[12px]" />
          <span class="font-heading text-lg font-semibold text-text">
            {{ t('brand-name') }}
          </span>
        </div>
        <h1 class="font-heading text-[28px] font-semibold text-text">
          {{ t('onboarding-title') }}
        </h1>
        <p class="mt-2 font-body text-sm text-text-secondary">
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
                class="h-12 w-full rounded-md border-0 bg-input py-3 pl-4 pr-10 font-body text-sm text-text-muted"
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
              class="h-12 w-full rounded-md border-0 bg-input px-4 font-body text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </label>

          <label class="flex flex-col gap-1.5 font-body text-[13px] font-medium text-text">
            {{ t('field-last-name') }}
            <input
              type="text"
              name="lastName"
              required
              [(ngModel)]="lastName"
              class="h-12 w-full rounded-md border-0 bg-input px-4 font-body text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </label>

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
    try {
      const result = await this.api.onboarding(this.firstName(), this.lastName());
      this.session.setUser(result.user);
      await this.router.navigateByUrl('/courses');
    } finally {
      this.busy.set(false);
    }
  }
}
