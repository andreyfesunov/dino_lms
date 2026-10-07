import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { SessionStore } from '../../core/session.store';
import { I18nService } from '../../core/i18n.service';
import { DinoLogo } from '../../shared/dino-logo';
import { Icon } from '../../shared/icon';

@Component({
  selector: 'app-welcome',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DinoLogo, Icon],
  template: `
    <div class="welcome relative min-h-screen overflow-hidden bg-inverse text-text-inverse">
      <img
        class="absolute inset-0 h-full w-full object-cover"
        src="welcome-hero.jpg"
        alt=""
        aria-hidden="true"
      />
      <div class="welcome__overlay absolute inset-0" aria-hidden="true"></div>

      <div
        class="relative z-10 flex min-h-screen flex-col justify-between px-6 py-10 md:px-16 md:py-14 xl:px-24 xl:py-[72px]"
      >
        <header class="welcome__brand flex items-center justify-between gap-4">
          <div class="flex items-center gap-3">
            <app-dino-logo sizeClass="h-9 w-9 rounded-[10px] md:h-10 md:w-10 md:rounded-xl" />
            <span class="font-heading text-lg font-semibold md:text-[22px]">
              {{ t('brand-name') }}
            </span>
          </div>
          <div class="flex items-center gap-4">
            <p class="hidden font-body text-[13px] text-primary-soft md:block">
              {{ welcomeStatus() }}
            </p>
            <div class="flex items-center gap-1 text-sm text-text-muted">
              <button type="button" [class]="langClass('en')" (click)="setLang('en')">
                {{ t('nav-lang-en') }}
              </button>
              <span>/</span>
              <button type="button" [class]="langClass('ru')" (click)="setLang('ru')">
                {{ t('nav-lang-ru') }}
              </button>
            </div>
          </div>
        </header>

        <section class="welcome__hero flex w-full max-w-xl flex-col items-start gap-5 md:gap-6">
          <h1
            class="font-heading text-5xl font-semibold tracking-tight md:text-6xl xl:text-[72px] xl:tracking-[-0.02em]"
          >
            {{ t('brand-name') }}
          </h1>
          <p
            class="whitespace-pre-line font-heading text-[22px] font-medium leading-snug text-primary-soft md:text-[28px]"
          >
            {{ t('welcome-tagline') }}
          </p>
          <p class="max-w-xl font-body text-base leading-normal text-text-inverse/80 md:text-lg">
            {{ t('welcome-desc') }}
          </p>
          <a
            [href]="welcomeHref()"
            class="welcome__cta mt-2 inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-md bg-surface px-7 font-body text-base font-semibold text-primary hover:bg-surface/95 focus:outline-none focus:ring-2 focus:ring-primary-soft/50 md:w-auto"
          >
            {{ welcomeCta() }}
            <app-icon name="arrow-right" extra="text-primary" />
          </a>
        </section>

        <footer
          class="welcome__footer flex flex-col gap-2 font-body text-xs text-text-inverse/40 sm:flex-row sm:items-center sm:justify-between"
        >
          <p>{{ t('brand-footer') }}</p>
          <p class="hidden sm:block">{{ welcomeFooterHint() }}</p>
        </footer>
      </div>
    </div>
  `,
})
export class WelcomePage implements OnInit {
  readonly session = inject(SessionStore);
  private i18n = inject(I18nService);
  private router = inject(Router);

  async ngOnInit(): Promise<void> {
    if (this.session.signedIn() && !this.session.needsOnboarding()) {
      await this.router.navigateByUrl('/courses');
    } else if (this.session.signedIn() && this.session.needsOnboarding()) {
      await this.router.navigateByUrl('/onboarding');
    }
  }

  t(key: string): string {
    return this.i18n.format(key);
  }

  setLang(lang: 'en' | 'ru'): void {
    this.i18n.setLocale(lang);
  }

  langClass(lang: 'en' | 'ru'): string {
    return this.i18n.locale() === lang
      ? 'font-semibold text-text-inverse'
      : 'hover:text-text-inverse';
  }

  welcomeHref(): string {
    return this.session.hasAdmin() ? '/login' : '/setup';
  }

  welcomeCta(): string {
    return this.session.hasAdmin() ? this.t('welcome-cta') : this.t('welcome-cta-setup');
  }

  welcomeStatus(): string {
    return this.session.hasAdmin() ? this.t('welcome-status') : this.t('welcome-status-setup');
  }

  welcomeFooterHint(): string {
    return this.session.hasAdmin()
      ? this.t('welcome-footer-hint')
      : this.t('welcome-footer-hint-setup');
  }
}
