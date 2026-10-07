import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from '../core/api.service';
import { SessionStore } from '../core/session.store';
import { I18nService } from '../core/i18n.service';
import { Icon } from './icon';

type NavId = 'courses' | 'users' | 'settings' | null;

@Component({
  selector: 'app-sidebar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  template: `
    @if (session.signedIn()) {
      <aside
        class="hidden h-[calc(100vh-2rem)] w-[72px] shrink-0 flex-col justify-between rounded-xl bg-surface p-3 shadow-[0_4px_24px_rgba(27,58,40,0.08)] md:flex lg:w-[220px] lg:p-4"
      >
        <div class="flex flex-col gap-1">
          @if (canGoBack()) {
            <button
              type="button"
              (click)="back()"
              class="flex items-center justify-center rounded-md p-2.5 text-text-secondary hover:bg-input lg:hidden"
              [attr.aria-label]="t('nav-back')"
            >
              <app-icon name="arrow-left" />
            </button>
            <button
              type="button"
              (click)="back()"
              class="hidden w-full items-center gap-3 rounded-md px-3 py-2.5 font-body text-sm font-medium text-text-secondary hover:bg-input lg:flex"
            >
              <app-icon name="arrow-left" />
              <span>{{ t('nav-back') }}</span>
            </button>
            <div class="my-1 h-px bg-border"></div>
          }

          <a
            href="/courses"
            class="items-center justify-center rounded-md p-2.5 lg:hidden"
            [class]="navIconClass(isActive('courses'))"
          >
            <app-icon name="graduation-cap" [extra]="tone(isActive('courses'))" />
          </a>
          <a
            href="/courses"
            class="hidden items-center gap-3 rounded-md px-3 py-2.5 font-body text-sm font-medium lg:flex"
            [class]="navItemClass(isActive('courses'))"
          >
            <app-icon name="graduation-cap" [extra]="tone(isActive('courses'))" />
            <span>{{ t('nav-courses') }}</span>
          </a>

          @if (session.isAdmin()) {
            <a
              href="/users"
              class="items-center justify-center rounded-md p-2.5 lg:hidden"
              [class]="navIconClass(isActive('users'))"
            >
              <app-icon name="user-cog" [extra]="tone(isActive('users'))" />
            </a>
            <a
              href="/users"
              class="hidden items-center gap-3 rounded-md px-3 py-2.5 font-body text-sm font-medium lg:flex"
              [class]="navItemClass(isActive('users'))"
            >
              <app-icon name="user-cog" [extra]="tone(isActive('users'))" />
              <span>{{ t('nav-users') }}</span>
            </a>
          }
        </div>

        <div class="flex flex-col gap-1">
          <div [class]="menuClass()">
            <div class="profile-menu__panel">
              <div class="profile-menu__inner flex flex-col gap-1">
                <a
                  href="/settings"
                  class="items-center justify-center rounded-md p-2.5 lg:hidden"
                  [class]="navIconClass(isActive('settings'))"
                >
                  <app-icon name="settings" [extra]="tone(isActive('settings'))" />
                </a>
                <a
                  href="/settings"
                  class="hidden items-center gap-3 rounded-md px-3 py-2.5 font-body text-sm font-medium lg:flex"
                  [class]="navItemClass(isActive('settings'))"
                >
                  <app-icon name="settings" [extra]="tone(isActive('settings'))" />
                  <span>{{ t('nav-settings') }}</span>
                </a>
                <button
                  type="button"
                  (click)="logout()"
                  class="w-full items-center gap-3 rounded-md px-3 py-2.5 font-body text-sm font-medium text-danger hover:bg-danger/10 lg:hidden"
                >
                  <app-icon name="log-out" extra="text-danger" />
                </button>
                <button
                  type="button"
                  (click)="logout()"
                  class="hidden w-full items-center gap-3 rounded-md px-3 py-2.5 font-body text-sm font-medium text-danger hover:bg-danger/10 lg:flex"
                >
                  <app-icon name="log-out" extra="text-danger" />
                  <span>{{ t('nav-logout') }}</span>
                </button>
              </div>
            </div>
          </div>

          <button
            type="button"
            (click)="toggleMenu()"
            class="flex items-center justify-center gap-3 rounded-md px-3 py-2.5 text-left hover:bg-input lg:justify-start"
          >
            <span
              class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-text-inverse"
            >
              <app-icon name="user" extra="h-3.5 w-3.5" />
            </span>
            <span class="hidden truncate font-body text-sm font-medium text-text lg:inline">
              {{ session.user()?.short_name }}
            </span>
          </button>
        </div>
      </aside>

      <nav
        class="fixed inset-x-0 bottom-0 z-40 flex items-end justify-between gap-1 border-t border-border bg-surface px-3 pb-3 pt-2 md:hidden"
      >
        <a
          href="/courses"
          class="flex flex-1 flex-col items-center gap-1 rounded-md py-1"
          [class]="isActive('courses') ? 'text-primary' : 'text-text-secondary'"
        >
          <app-icon name="graduation-cap" extra="h-5 w-5" />
          <span class="font-body text-[11px]">{{ t('nav-courses') }}</span>
        </a>
        @if (session.isAdmin()) {
          <a
            href="/users"
            class="flex flex-1 flex-col items-center gap-1 rounded-md py-1"
            [class]="isActive('users') ? 'text-primary' : 'text-text-secondary'"
          >
            <app-icon name="users" extra="h-5 w-5" />
            <span class="font-body text-[11px]">{{ t('nav-people') }}</span>
          </a>
        }
        <a
          href="/settings"
          class="flex flex-1 flex-col items-center gap-1 rounded-md py-1"
          [class]="isActive('settings') ? 'text-primary' : 'text-text-secondary'"
        >
          <app-icon name="more-horizontal" extra="h-5 w-5" />
          <span class="font-body text-[11px]">{{ t('nav-more') }}</span>
        </a>
        <button
          type="button"
          (click)="logout()"
          class="flex flex-1 flex-col items-center gap-1 rounded-md py-1 text-danger hover:bg-danger/10"
        >
          <app-icon name="log-out" extra="h-5 w-5" />
          <span class="font-body text-[11px]">{{ t('nav-logout') }}</span>
        </button>
      </nav>
    }
  `,
})
export class Sidebar {
  readonly session = inject(SessionStore);
  private api = inject(ApiService);
  private i18n = inject(I18nService);
  private router = inject(Router);

  private readonly menuOpen = signal(false);

  t(key: string): string {
    return this.i18n.format(key);
  }

  isActive(id: Exclude<NavId, null>): boolean {
    const url = this.router.url;
    if (id === 'users') {
      return url === '/users';
    }
    if (id === 'settings') {
      return url === '/settings';
    }
    return url === '/courses' || url.startsWith('/courses/');
  }

  async logout(): Promise<void> {
    try {
      await this.api.logout();
    } finally {
      this.session.clear();
      this.router.navigateByUrl('/login');
    }
  }

  toggleMenu(): void {
    this.menuOpen.update((open) => !open);
  }

  canGoBack(): boolean {
    return typeof history !== 'undefined' && history.length > 1;
  }

  menuClass(): string {
    return this.menuOpen()
      ? 'profile-menu profile-menu--open flex flex-col gap-1'
      : 'profile-menu flex flex-col gap-1';
  }

  navItemClass(active: boolean): string {
    return active ? 'flex text-text-inverse bg-primary' : 'flex text-text-secondary hover:bg-input';
  }

  navIconClass(active: boolean): string {
    return active ? 'flex text-text-inverse bg-primary' : 'flex text-text-secondary hover:bg-input';
  }

  tone(active: boolean): string {
    return active ? 'text-text-inverse' : 'text-text-secondary';
  }

  back(): void {
    history.back();
  }
}
