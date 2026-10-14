import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { SessionStore } from '../core/session.store';
import { I18nService } from '../core/i18n.service';
import { Icon } from './icon';

type NavId = 'courses' | 'calls' | 'users' | 'settings' | null;

@Component({
  selector: 'app-sidebar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon, RouterLink],
  template: `
    @if (session.signedIn()) {
      <aside
        class="sticky top-4 hidden h-[calc(100dvh-2rem)] w-[68px] shrink-0 flex-col justify-between rounded-xl bg-surface px-3 py-4 md:flex lg:w-[220px]"
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

          @if (session.isAdmin()) {
            <a
              routerLink="/users"
              [attr.aria-label]="t('nav-users')"
              class="items-center justify-center rounded-md p-2.5 lg:hidden"
              [class]="navIconClass(isActive('users'))"
            >
              <app-icon name="user-cog" [extra]="tone(isActive('users'))" />
            </a>
            <a
              routerLink="/users"
              [attr.aria-label]="t('nav-users')"
              class="hidden items-center gap-3 rounded-md px-3 py-2.5 font-body text-sm font-medium lg:flex"
              [class]="navItemClass(isActive('users'))"
            >
              <app-icon name="user-cog" [extra]="tone(isActive('users'))" />
              <span>{{ t('nav-users') }}</span>
            </a>
          }

          <a
            routerLink="/courses"
            [attr.aria-label]="t('nav-courses')"
            class="items-center justify-center rounded-md p-2.5 lg:hidden"
            [class]="navIconClass(isActive('courses'))"
          >
            <app-icon name="graduation-cap" [extra]="tone(isActive('courses'))" />
          </a>
          <a
            routerLink="/courses"
            [attr.aria-label]="t('nav-courses')"
            class="hidden items-center gap-3 rounded-md px-3 py-2.5 font-body text-sm font-medium lg:flex"
            [class]="navItemClass(isActive('courses'))"
          >
            <app-icon name="graduation-cap" [extra]="tone(isActive('courses'))" />
            <span>{{ t('nav-courses') }}</span>
          </a>

          <a
            routerLink="/calls"
            [attr.aria-label]="t('nav-calls')"
            class="flex items-center justify-center gap-3 rounded-md px-3 py-2.5 lg:justify-start"
            [class]="navItemClass(isActive('calls'))"
          >
            <app-icon name="clock" /><span class="hidden lg:inline">{{ t('nav-calls') }}</span>
          </a>
        </div>

        <div class="flex flex-col gap-1">
          <a
            routerLink="/settings"
            [attr.aria-label]="t('nav-settings')"
            class="items-center justify-center rounded-md p-2.5 lg:hidden"
            [class]="navIconClass(isActive('settings'))"
          >
            <app-icon name="settings" [extra]="tone(isActive('settings'))" />
          </a>
          <a
            routerLink="/settings"
            [attr.aria-label]="t('nav-settings')"
            class="hidden items-center gap-3 rounded-md px-3 py-2.5 font-body text-sm font-medium lg:flex"
            [class]="navItemClass(isActive('settings'))"
          >
            <app-icon name="settings" [extra]="tone(isActive('settings'))" />
            <span>{{ t('nav-settings') }}</span>
          </a>
          <button
            type="button"
            (click)="logout()"
            [attr.aria-label]="t('nav-logout')"
            class="w-full items-center gap-3 rounded-md px-3 py-2.5 font-body text-sm font-medium text-danger hover:bg-danger/10 lg:hidden"
          >
            <app-icon name="log-out" extra="text-danger" />
          </button>
          <button
            type="button"
            (click)="logout()"
            [attr.aria-label]="t('nav-logout')"
            class="hidden w-full items-center gap-3 rounded-md px-3 py-2.5 font-body text-sm font-medium text-danger hover:bg-danger/10 lg:flex"
          >
            <app-icon name="log-out" extra="text-danger" />
            <span>{{ t('nav-logout') }}</span>
          </button>

          <a
            routerLink="/settings"
            [attr.aria-label]="t('nav-settings')"
            class="flex min-w-0 w-full items-center justify-center gap-3 rounded-md px-3 py-2.5 text-left hover:bg-input lg:justify-start"
            [title]="session.user()?.display_name ?? ''"
          >
            <span
              class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-text-inverse"
            >
              <app-icon name="user" extra="h-3.5 w-3.5" />
            </span>
            <span
              class="hidden min-w-0 flex-1 whitespace-normal break-words font-body text-sm font-medium leading-snug text-text lg:block"
            >
              {{ session.user()?.short_name || session.user()?.display_name }}
            </span>
          </a>
        </div>
      </aside>

      <nav
        class="design-bottom-nav fixed inset-x-0 bottom-0 z-40 flex items-center justify-between gap-1 border-t border-border bg-surface px-4 pt-2 md:hidden"
      >
        <a
          routerLink="/courses"
          [attr.aria-label]="t('nav-courses')"
          class="flex flex-1 flex-col items-center gap-1 rounded-md py-1"
          [class]="isActive('courses') ? 'text-primary' : 'text-text-secondary'"
        >
          <app-icon name="graduation-cap" extra="h-5 w-5" />
          <span class="font-body text-[12px]">{{ t('nav-courses') }}</span>
        </a>
        <a
          routerLink="/calls"
          [attr.aria-label]="t('nav-calls')"
          class="flex flex-1 flex-col items-center gap-1 rounded-md py-1"
          [class]="isActive('calls') ? 'text-primary' : 'text-text-secondary'"
        >
          <app-icon name="clock" extra="h-5 w-5" /><span class="font-body text-[12px]">{{
            t('nav-calls')
          }}</span>
        </a>
        @if (session.isAdmin()) {
          <a
            routerLink="/students/new"
            [attr.aria-label]="t('users-add-student')"
            class="flex flex-1 flex-col items-center gap-1 text-primary"
          >
            <span
              class="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-text-inverse"
              ><app-icon name="plus" extra="h-5 w-5"
            /></span>
            <span class="font-body text-[12px]">{{ t('nav-create') }}</span>
          </a>
        }
        @if (session.isAdmin()) {
          <a
            routerLink="/users"
            [attr.aria-label]="t('nav-users')"
            class="flex flex-1 flex-col items-center gap-1 rounded-md py-1"
            [class]="isActive('users') ? 'text-primary' : 'text-text-secondary'"
          >
            <app-icon name="users" extra="h-5 w-5" />
            <span class="font-body text-[12px]">{{ t('nav-people') }}</span>
          </a>
        }
        <a
          routerLink="/settings"
          [attr.aria-label]="t('nav-settings')"
          class="flex flex-1 flex-col items-center gap-1 rounded-md py-1"
          [class]="isActive('settings') ? 'text-primary' : 'text-text-secondary'"
        >
          <app-icon name="more-horizontal" extra="h-5 w-5" />
          <span class="font-body text-[12px]">{{ t('nav-more') }}</span>
        </a>
      </nav>
    }
  `,
})
export class Sidebar {
  readonly session = inject(SessionStore);
  private api = inject(ApiService);
  private i18n = inject(I18nService);
  private router = inject(Router);

  t(key: string): string {
    return this.i18n.format(key);
  }

  isActive(id: Exclude<NavId, null>): boolean {
    const url = this.router.url;
    if (id === 'calls') {
      return url === '/calls';
    }
    if (id === 'users') {
      return url === '/users' || url === '/students/new';
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

  canGoBack(): boolean {
    return typeof history !== 'undefined' && history.length > 1;
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
