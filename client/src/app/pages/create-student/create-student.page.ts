import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { I18nService } from '../../core/i18n.service';
import { Icon } from '../../shared/icon';

@Component({
  selector: 'app-create-student',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, Icon],
  template: `
    <section
      class="flex h-full min-h-[calc(100vh-2rem)] flex-col gap-6 rounded-xl bg-surface p-5 shadow-[0_4px_24px_rgba(27,58,40,0.06)] md:p-8"
    >
      <div class="flex items-center justify-between gap-4">
        <a
          href="/users"
          class="inline-flex items-center gap-2 font-body text-[13px] text-text-secondary hover:text-text"
        >
          <app-icon name="arrow-left" extra="h-4 w-4" />
          {{ t('students-back') }}
        </a>
      </div>

      <div class="flex flex-col gap-2">
        <h1 class="font-heading text-[26px] font-semibold text-text">
          {{ t('students-new-title') }}
        </h1>
        <p class="font-body text-sm text-text-secondary">
          {{ t('students-new-subtitle') }}
        </p>
      </div>

      <form class="flex max-w-md flex-col gap-4" (ngSubmit)="submit()" #form="ngForm">
        <label class="flex flex-col gap-2 font-body text-[13px] font-medium text-text">
          {{ t('field-email') }}
          <input
            name="login"
            type="email"
            required
            [placeholder]="t('students-login-placeholder')"
            [(ngModel)]="login"
            class="h-12 w-full rounded-md border border-border bg-input px-4 font-body text-sm text-text placeholder:text-text-muted focus:border-primary focus:outline-none"
          />
        </label>

        <label class="flex flex-col gap-2 font-body text-[13px] font-medium text-text">
          {{ t('students-password-hint') }}
          <input
            name="password"
            [placeholder]="t('students-password-placeholder')"
            [(ngModel)]="password"
            class="h-12 w-full rounded-md border border-border bg-input px-4 font-body text-sm text-text placeholder:text-text-muted focus:border-primary focus:outline-none"
          />
        </label>

        @if (temporaryPassword(); as pwd) {
          <div class="flex items-center justify-between gap-3 rounded-md bg-inverse px-4 py-3">
            <code class="font-mono text-sm text-text-inverse">{{ pwd }}</code>
            <button
              type="button"
              class="rounded-md p-1.5 text-text-inverse transition-colors hover:bg-white/10"
              (click)="copy(pwd)"
            >
              <app-icon name="copy" extra="h-4 w-4 text-text-inverse" />
            </button>
          </div>
        }

        <div class="flex items-center gap-2">
          <button
            type="submit"
            [disabled]="form.invalid || busy()"
            class="inline-flex h-12 items-center justify-center rounded-md bg-primary px-5 font-body text-[15px] font-semibold text-text-inverse hover:bg-inverse disabled:opacity-50"
          >
            {{ t('students-create') }}
          </button>
          @if (temporaryPassword()) {
            <a
              href="/users"
              class="inline-flex h-12 items-center rounded-md border border-border px-5 font-body text-sm font-medium text-text hover:bg-input"
            >
              {{ t('students-back-to-users') }}
            </a>
          }
        </div>
      </form>
    </section>
  `,
})
export class CreateStudentPage {
  private api = inject(ApiService);
  private i18n = inject(I18nService);

  readonly login = signal('');
  readonly password = signal('');
  readonly temporaryPassword = signal('');
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
      const password = this.password().trim();
      const result = await this.api.createStudent(
        this.login().trim(),
        password ? password : undefined,
      );
      this.temporaryPassword.set(result.temporary_password ?? '');
    } finally {
      this.busy.set(false);
    }
  }

  copy(value: string): void {
    void navigator.clipboard?.writeText(value);
  }
}
