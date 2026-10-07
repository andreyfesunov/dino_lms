import { ChangeDetectionStrategy, Component, HostListener, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, ApiError } from '../../core/api.service';
import { InvitedAccount, UserResponse } from '../../core/api.types';
import { SessionStore } from '../../core/session.store';
import { I18nService } from '../../core/i18n.service';
import { Icon } from '../../shared/icon';

@Component({
  selector: 'app-users',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, Icon],
  template: `
    @if (error()) {
      <p role="alert" class="rounded-md bg-danger/10 p-4 text-danger">{{ error() }}</p>
    }
    <section
      class="flex h-full min-h-[calc(100vh-2rem)] flex-col gap-6 rounded-xl bg-surface p-5 pb-28 shadow-[0_4px_24px_rgba(27,58,40,0.06)] md:p-8 md:pb-28"
    >
      <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div class="flex flex-col gap-1">
          <h1 class="font-heading text-3xl font-semibold text-text">{{ t('users-title') }}</h1>
          <p class="font-body text-sm text-text-secondary">{{ t('users-subtitle') }}</p>
        </div>
        <div class="flex items-center gap-2">
          <a
            href="/students/new"
            class="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2.5 font-body text-sm font-medium text-text hover:bg-input"
          >
            <app-icon name="user-plus" extra="h-4 w-4" />
            {{ t('users-add-student') }}
          </a>
          <button
            type="button"
            (click)="openInvite()"
            class="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 font-body text-sm font-semibold text-text-inverse hover:bg-inverse"
          >
            <app-icon name="plus" extra="h-4 w-4 text-text-inverse" />
            <span>{{ t('users-invite') }}</span>
          </button>
        </div>
      </div>

      <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <label class="relative block w-full max-w-md">
          <span
            class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
          >
            <app-icon name="search" extra="h-4 w-4" />
          </span>
          <input
            type="search"
            [placeholder]="t('users-search-placeholder')"
            [(ngModel)]="search"
            class="h-11 w-full rounded-md border-0 bg-input py-2.5 pl-10 pr-3 font-body text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </label>
        <div class="flex flex-wrap gap-2">
          <button type="button" [class]="chipClass(filter() === 'all')" (click)="setFilter('all')">
            {{ t('users-filter-all') }}
          </button>
          <button
            type="button"
            [class]="chipClass(filter() === 'active')"
            (click)="setFilter('active')"
          >
            {{ t('users-filter-active') }}
          </button>
          <button
            type="button"
            [class]="chipClass(filter() === 'pending')"
            (click)="setFilter('pending')"
          >
            {{ t('users-filter-pending') }}
          </button>
        </div>
      </div>

      @if (selected().length > 0) {
        <div
          data-testid="bulk-actions"
          class="fixed bottom-24 left-1/2 z-40 flex w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3 font-body text-sm text-text shadow-xl md:bottom-6"
        >
          <span>{{ t('users-selected-count', { count: selected().length }) }}</span>
          <div class="flex items-center gap-2">
            <button
              type="button"
              (click)="selected.set([])"
              class="rounded-md border border-border px-3 py-1.5 font-body text-xs font-medium text-text-secondary hover:bg-border"
            >
              {{ t('action-cancel') }}
            </button>
            <button
              type="button"
              (click)="bulkDelete()"
              class="inline-flex items-center gap-1.5 rounded-md bg-danger px-3 py-1.5 font-body text-xs font-semibold text-white hover:opacity-90"
            >
              <app-icon name="trash" extra="h-3.5 w-3.5" />
              {{ t('users-delete-selected') }}
            </button>
          </div>
        </div>
      }

      <div class="overflow-x-auto" (scroll)="positionRowMenu()">
        <table class="w-full border-collapse">
          <thead>
            <tr class="border-b border-border text-left">
              <th class="w-10 py-3"></th>
              <th class="py-3 font-body text-xs font-semibold text-text-muted">
                {{ t('users-col-name') }}
              </th>
              <th class="py-3 font-body text-xs font-semibold text-text-muted">
                {{ t('users-col-login') }}
              </th>
              <th class="py-3 font-body text-xs font-semibold text-text-muted">
                {{ t('users-col-role') }}
              </th>
              <th class="py-3 font-body text-xs font-semibold text-text-muted">
                {{ t('users-col-status') }}
              </th>
              <th class="w-12 py-3"></th>
            </tr>
          </thead>
          <tbody>
            @for (user of rows(); track user.id) {
              <tr class="border-b border-border/60 last:border-0">
                <td class="py-3 align-middle">
                  <div class="flex items-center">
                    <input
                      type="checkbox"
                      [checked]="isSelected(user.id)"
                      [disabled]="user.id === session.user()?.id"
                      (change)="toggleSelected(user.id)"
                      class="block h-[18px] w-[18px] shrink-0 cursor-pointer rounded border-border accent-primary focus:ring-primary/30"
                    />
                  </div>
                </td>
                <td class="py-3 font-body text-sm font-medium text-text">
                  {{ user.display_name }}
                </td>
                <td class="py-3 font-body text-sm text-text-secondary">{{ user.login }}</td>
                <td class="py-3">
                  <span
                    class="inline-flex rounded-full bg-input px-2.5 py-0.5 font-body text-xs font-medium text-text-secondary"
                  >
                    {{ roleLabel(user.role) }}
                  </span>
                </td>
                <td class="py-3">
                  <span [class]="statusClass(user.status)">
                    {{ statusLabel(user.status) }}
                  </span>
                </td>
                <td class="relative py-3 text-right">
                  <button
                    type="button"
                    class="inline-flex cursor-pointer rounded-md p-2 text-text-muted hover:bg-input hover:text-text"
                    [attr.aria-label]="t('users-row-actions', { name: user.display_name })"
                    [attr.popovertarget]="'user-actions-' + user.id"
                    (click)="toggleRowMenu($event, user.id)"
                  >
                    <app-icon name="more-horizontal" />
                  </button>
                  <div
                    [id]="'user-actions-' + user.id"
                    popover="auto"
                    class="fixed inset-auto m-0 w-44 overflow-y-auto rounded-lg border border-border bg-surface py-1 shadow-lg"
                  >
                    <button
                      type="button"
                      class="flex w-full items-center gap-2 px-3 py-2 text-left font-body text-sm text-text hover:bg-input"
                      (click)="openEdit(user)"
                    >
                      <app-icon name="pencil" extra="h-4 w-4" />
                      {{ t('users-action-edit') }}
                    </button>
                    <button
                      type="button"
                      class="flex w-full items-center gap-2 px-3 py-2 text-left font-body text-sm text-text hover:bg-input"
                      (click)="openPassword(user)"
                    >
                      <app-icon name="key" extra="h-4 w-4" />
                      {{ t('users-action-password') }}
                    </button>
                    <a
                      href="/courses"
                      class="flex w-full items-center gap-2 px-3 py-2 text-left font-body text-sm text-text hover:bg-input"
                    >
                      <app-icon name="graduation-cap" extra="h-4 w-4" />
                      {{ t('users-action-courses') }}
                    </a>
                    <button
                      type="button"
                      [disabled]="user.id === session.user()?.id"
                      class="flex w-full items-center gap-2 px-3 py-2 text-left font-body text-sm text-danger hover:bg-danger/10 disabled:opacity-40"
                      (click)="openDelete(user.id)"
                    >
                      <app-icon name="trash" extra="h-4 w-4" />
                      {{ t('users-action-delete') }}
                    </button>
                  </div>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      @if (modal() === 1) {
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-[#1B3A28]/40 p-4">
          <div class="w-full max-w-lg rounded-xl bg-surface p-6 shadow-xl">
            <div class="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 class="font-heading text-xl font-semibold text-text">
                  {{ t('users-invite-title') }}
                </h2>
                <p class="mt-1 font-body text-sm text-text-secondary">
                  {{ t('users-invite-sub') }}
                </p>
              </div>
              <button
                type="button"
                class="rounded-md p-1 text-text-secondary hover:bg-input"
                (click)="modal.set(0)"
              >
                <app-icon name="x" />
              </button>
            </div>
            <label class="flex flex-col gap-1.5 font-body text-[13px] font-medium text-text">
              {{ t('users-invite-label') }}
              <textarea
                rows="4"
                [(ngModel)]="inviteEmails"
                class="w-full rounded-md border border-border bg-input p-3 font-body text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/30"
              ></textarea>
              <p class="mt-2 font-body text-xs text-text-muted">
                {{ t('users-invite-hint') }}
              </p>
            </label>
            <div class="mt-5 flex justify-end gap-2">
              <button
                type="button"
                class="rounded-md bg-input px-4 py-2.5 font-body text-sm font-medium text-text hover:bg-border"
                (click)="modal.set(0)"
              >
                {{ t('action-cancel') }}
              </button>
              <button
                type="button"
                [disabled]="!inviteEmails().trim()"
                class="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 font-body text-sm font-semibold text-text-inverse hover:bg-inverse disabled:opacity-50"
                (click)="submitInvite()"
              >
                {{ inviteSubmitLabel() }}
              </button>
            </div>
          </div>
        </div>
      }
      @if (modal() === 4) {
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-[#1B3A28]/40 p-4">
          <div class="w-full max-w-lg rounded-xl bg-surface p-6 shadow-xl">
            <div class="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 class="font-heading text-xl font-semibold text-text">
                  {{ t('users-created-title') }}
                </h2>
                <p class="mt-1 font-body text-sm text-text-secondary">
                  {{ t('users-created-sub') }}
                </p>
              </div>
              <button
                type="button"
                class="rounded-md p-1 text-text-secondary hover:bg-input"
                (click)="modal.set(0)"
              >
                <app-icon name="x" />
              </button>
            </div>
            <div class="flex flex-col gap-2">
              @for (account of created(); track account.id) {
                <div class="flex items-center justify-between gap-3 rounded-md bg-input px-3 py-2">
                  <div class="flex min-w-0 flex-col">
                    <span class="truncate font-body text-sm font-medium text-text">
                      {{ account.login }}
                    </span>
                    <code class="font-mono text-xs text-text-secondary">
                      {{ account.temporary_password }}
                    </code>
                  </div>
                  <button
                    type="button"
                    class="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 font-body text-xs font-medium text-text-secondary hover:bg-border"
                    (click)="copyText(account.temporary_password)"
                  >
                    <app-icon name="copy" extra="h-3.5 w-3.5" />
                    {{ t('action-copy') }}
                  </button>
                </div>
              }
            </div>
            <p class="mt-3 font-body text-xs text-text-muted">
              {{ t('users-created-hint') }}
            </p>
            <div class="mt-5 flex items-center justify-between gap-3">
              <button
                type="button"
                class="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2.5 font-body text-sm font-medium text-text hover:bg-input"
                (click)="copyAll()"
              >
                <app-icon name="copy" extra="h-4 w-4" />
                {{ t('action-copy-all') }}
              </button>
              <button
                type="button"
                class="rounded-md bg-primary px-4 py-2.5 font-body text-sm font-semibold text-text-inverse hover:bg-inverse"
                (click)="modal.set(0)"
              >
                {{ t('action-done') }}
              </button>
            </div>
          </div>
        </div>
      }
      @if (modal() === 2) {
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-[#1B3A28]/40 p-4">
          <div class="w-full max-w-lg rounded-xl bg-surface p-6 shadow-xl">
            <div class="mb-4 flex items-start justify-between gap-4">
              <h2 class="font-heading text-xl font-semibold text-text">
                {{ t('users-edit-title') }}
              </h2>
              <button
                type="button"
                class="rounded-md p-1 text-text-secondary hover:bg-input"
                (click)="modal.set(0)"
              >
                <app-icon name="x" />
              </button>
            </div>
            <div class="flex flex-col gap-3">
              <label class="flex flex-col gap-1.5 font-body text-[13px] font-medium text-text">
                {{ t('users-edit-name') }}
                <input
                  [(ngModel)]="editName"
                  class="h-11 rounded-md border border-border bg-input px-3 font-body text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </label>
              <label class="flex flex-col gap-1.5 font-body text-[13px] font-medium text-text">
                {{ t('users-edit-role') }}
                <select
                  [(ngModel)]="editRole"
                  class="h-11 rounded-md border-0 bg-input px-3 font-body text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="admin">{{ t('role-admin') }}</option>
                  <option value="teacher">{{ t('role-teacher') }}</option>
                  <option value="student">{{ t('role-student') }}</option>
                </select>
              </label>
              <label class="flex flex-col gap-1.5 font-body text-[13px] font-medium text-text">
                {{ t('users-edit-status') }}
                <select
                  [(ngModel)]="editStatus"
                  class="h-11 rounded-md border-0 bg-input px-3 font-body text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="active">{{ t('status-active') }}</option>
                  <option value="pending">{{ t('status-pending') }}</option>
                </select>
              </label>
            </div>
            <div class="mt-5 flex justify-end gap-2">
              <button
                type="button"
                class="rounded-md bg-input px-4 py-2.5 font-body text-sm font-medium text-text hover:bg-border"
                (click)="modal.set(0)"
              >
                {{ t('action-cancel') }}
              </button>
              <button
                type="button"
                class="rounded-md bg-primary px-4 py-2.5 font-body text-sm font-semibold text-text-inverse hover:bg-inverse"
                (click)="submitEdit()"
              >
                {{ t('action-save') }}
              </button>
            </div>
          </div>
        </div>
      }
      @if (modal() === 3) {
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-[#1B3A28]/40 p-4">
          <div class="w-full max-w-md rounded-xl bg-surface p-6 shadow-xl">
            <div class="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 class="font-heading text-xl font-semibold text-text">
                  {{ t('users-new-password-title') }}
                </h2>
                <p class="mt-1 font-body text-sm text-text-secondary">
                  {{ t('users-new-password-sub') }}
                </p>
              </div>
              <button
                type="button"
                class="rounded-md p-1 text-text-secondary hover:bg-input"
                (click)="modal.set(0)"
              >
                <app-icon name="x" />
              </button>
            </div>
            @if (newPassword(); as pwd) {
              <div
                class="mt-4 flex items-center justify-between gap-3 rounded-md bg-inverse px-4 py-3"
              >
                <code class="font-mono text-sm text-text-inverse">{{ pwd }}</code>
                <button
                  type="button"
                  class="rounded-md p-1.5 text-text-inverse transition-colors hover:bg-white/10"
                  (click)="copyText(pwd)"
                >
                  <app-icon name="copy" extra="h-4 w-4 text-text-inverse" />
                </button>
              </div>
            }
            <div class="mt-5 flex justify-end">
              <button
                type="button"
                class="rounded-md bg-primary px-4 py-2.5 font-body text-sm font-semibold text-text-inverse hover:bg-inverse"
                (click)="modal.set(0)"
              >
                {{ t('action-done') }}
              </button>
            </div>
          </div>
        </div>
      }
      @if (modal() === 5) {
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-[#1B3A28]/40 p-4">
          <div class="w-full max-w-md rounded-xl bg-surface p-6 shadow-xl">
            <h2 class="font-heading text-xl font-semibold text-text">
              {{ t('users-delete-title') }}
            </h2>
            <p class="mt-2 font-body text-sm text-text-secondary">
              {{ t('users-delete-confirm') }}
            </p>
            <div class="mt-5 flex justify-end gap-2">
              <button
                type="button"
                class="rounded-md bg-input px-4 py-2.5 font-body text-sm font-medium text-text hover:bg-border"
                (click)="modal.set(0)"
              >
                {{ t('action-cancel') }}
              </button>
              <button
                type="button"
                class="rounded-md bg-danger px-4 py-2.5 font-body text-sm font-semibold text-white hover:opacity-90"
                (click)="confirmDelete()"
              >
                {{ t('users-action-delete') }}
              </button>
            </div>
          </div>
        </div>
      }
    </section>
  `,
})
export class UsersPage {
  readonly session = inject(SessionStore);
  private api = inject(ApiService);
  private i18n = inject(I18nService);

  readonly users = signal<UserResponse[]>([]);
  readonly search = signal('');
  readonly filter = signal<'all' | 'active' | 'pending'>('all');
  readonly selected = signal<string[]>([]);
  readonly error = signal<string | null>(null);
  readonly busy = signal(false);
  private activeMenu: HTMLElement | null = null;
  private activeMenuAnchor: HTMLElement | null = null;
  readonly modal = signal(0); // 0 none, 1 invite, 2 edit, 3 password, 4 created, 5 delete
  readonly inviteEmails = signal('');
  readonly created = signal<InvitedAccount[]>([]);
  readonly newPassword = signal('');
  readonly editId = signal('');
  readonly editName = signal('');
  readonly editRole = signal('student');
  readonly editStatus = signal('pending');
  readonly deleteId = signal('');

  t(key: string, args?: Record<string, unknown>): string {
    return this.i18n.format(key, args);
  }

  async ngOnInit(): Promise<void> {
    await this.reload();
  }

  async reload(): Promise<void> {
    try {
      const result = await this.api.users();
      this.users.set(result.users);
    } catch {
      this.error.set(this.t('error-generic'));
    }
  }

  rows(): UserResponse[] {
    const query = this.search().trim().toLowerCase();
    const current = this.filter();
    return this.users().filter((user) => {
      const matchesStatus = current === 'all' || user.status === current;
      const matchesQuery =
        query === '' ||
        user.login.toLowerCase().includes(query) ||
        user.display_name.toLowerCase().includes(query);
      return matchesStatus && matchesQuery;
    });
  }

  setFilter(filter: 'all' | 'active' | 'pending'): void {
    this.filter.set(filter);
  }

  chipClass(active: boolean): string {
    return active
      ? 'rounded-full bg-primary px-3.5 py-1.5 font-body text-sm font-medium text-text-inverse'
      : 'rounded-full bg-input px-3.5 py-1.5 font-body text-sm font-medium text-text-secondary hover:bg-border';
  }

  roleLabel(role: string): string {
    return this.t('role-' + role);
  }

  statusLabel(status: string): string {
    return this.t('status-' + status);
  }

  statusClass(status: string): string {
    return status === 'active'
      ? 'inline-flex rounded-full bg-primary-soft px-2.5 py-0.5 font-body text-xs font-medium text-primary'
      : 'inline-flex rounded-full bg-[#F3E0C8] px-2.5 py-0.5 font-body text-xs font-medium text-[#8A5A2B]';
  }

  inviteSubmitLabel(): string {
    const count = this.inviteEmails()
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0).length;
    return this.t('users-invite-submit', { count });
  }

  toggleSelected(id: string): void {
    this.selected.update((list) =>
      list.includes(id) ? list.filter((x) => x !== id) : [...list, id],
    );
  }

  isSelected(id: string): boolean {
    return this.selected().includes(id);
  }

  toggleRowMenu(event: MouseEvent, id: string): void {
    event.preventDefault();
    const menu = document.getElementById('user-actions-' + id);
    if (!menu) return;
    if (menu.matches(':popover-open')) {
      this.closeRowMenu();
      return;
    }
    this.closeRowMenu();
    this.activeMenu = menu;
    this.activeMenuAnchor = event.currentTarget as HTMLElement;
    menu.showPopover();
    this.positionRowMenu();
  }

  @HostListener('window:scroll')
  positionRowMenu(): void {
    const menu = this.activeMenu;
    if (!menu?.matches(':popover-open') || !this.activeMenuAnchor) return;
    const anchor = this.activeMenuAnchor.getBoundingClientRect();
    if (anchor.bottom < 0 || anchor.top > window.innerHeight) {
      this.closeRowMenu();
      return;
    }
    menu.style.maxHeight = Math.max(0, window.innerHeight - 16) + 'px';
    const size = menu.getBoundingClientRect();
    menu.style.left =
      Math.max(8, Math.min(anchor.right - size.width, window.innerWidth - size.width - 8)) + 'px';
    const top =
      anchor.bottom + 4 + size.height <= window.innerHeight - 8
        ? anchor.bottom + 4
        : anchor.top - size.height - 4;
    menu.style.top = Math.max(8, top) + 'px';
  }

  @HostListener('window:resize')
  closeRowMenu(): void {
    this.activeMenu?.hidePopover();
    this.activeMenu = null;
    this.activeMenuAnchor = null;
  }

  openInvite(): void {
    this.inviteEmails.set('');
    this.modal.set(1);
  }

  async submitInvite(): Promise<void> {
    if (this.busy()) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    const emails = this.inviteEmails()
      .split(/[\n,;]/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    try {
      const result = await this.api.invite(emails);
      this.created.set(result.created);
      this.modal.set(result.created.length > 0 ? 4 : 0);
      await this.reload();
    } catch (e) {
      this.error.set(this.t('error-generic'));
      if (e instanceof ApiError && e.code === 'forbidden') {
        this.modal.set(0);
      }
    } finally {
      this.busy.set(false);
    }
  }

  copyText(value: string): void {
    void navigator.clipboard?.writeText(value);
  }

  copyAll(): void {
    const text = this.created()
      .map((account) => `${account.login} — ${account.temporary_password}`)
      .join('\n');
    void navigator.clipboard?.writeText(text);
  }

  openEdit(user: UserResponse): void {
    this.closeRowMenu();
    this.editId.set(user.id);
    this.editName.set(user.display_name === user.login ? '' : user.display_name);
    this.editRole.set(user.role);
    this.editStatus.set(user.status);
    this.modal.set(2);
  }

  async submitEdit(): Promise<void> {
    await this.perform(async () => {
      const name = this.editName().trim();
      let first: string | null = null;
      let last: string | null = null;
      if (name) {
        const parts = name.split(/\s+/);
        last = parts[0];
        first = parts.length > 1 ? parts.slice(1).join(' ') : null;
      }
      await this.api.updateUser(this.editId(), {
        first_name: first,
        last_name: last,
        role: this.editRole(),
        status: this.editStatus(),
      });
      this.modal.set(0);
      await this.reload();
    });
  }

  async openPassword(user: UserResponse): Promise<void> {
    await this.perform(async () => {
      this.closeRowMenu();
      const result = await this.api.generatePassword(user.id);
      this.newPassword.set(result.temporary_password);
      this.modal.set(3);
    });
  }

  openDelete(id: string): void {
    this.closeRowMenu();
    this.deleteId.set(id);
    this.modal.set(5);
  }

  async confirmDelete(): Promise<void> {
    await this.perform(async () => {
      await this.api.bulkDelete([this.deleteId()]);
      this.modal.set(0);
      await this.reload();
    });
  }

  async bulkDelete(): Promise<void> {
    await this.perform(async () => {
      await this.api.bulkDelete(this.selected());
      this.selected.set([]);
      await this.reload();
    });
  }

  private async perform(action: () => Promise<void>): Promise<void> {
    if (this.busy()) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      await action();
    } catch (e) {
      this.error.set(this.t(e instanceof ApiError && e.code === 'calls_user_busy' ? 'calls-user-busy' : 'error-generic'));
    } finally {
      this.busy.set(false);
    }
  }
}
