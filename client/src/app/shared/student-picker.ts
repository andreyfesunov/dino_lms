import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { UserResponse } from '../core/api.types';
import { I18nService } from '../core/i18n.service';
import { Icon } from './icon';

@Component({
  selector: 'app-student-picker',
  imports: [FormsModule, Icon],
  template: `
    <label class="flex flex-col gap-1.5 font-body text-xs font-semibold text-text">
      {{ t('access-student-label') }}
      <span class="relative block">
        <app-icon
          name="search"
          extra="pointer-events-none absolute left-3 top-3 h-4 w-4 text-text-muted"
        />
        <input
          type="search"
          [ngModel]="query()"
          (ngModelChange)="query.set($event)"
          [disabled]="disabled()"
          [attr.aria-label]="t('access-student-label')"
          [placeholder]="t('access-student-placeholder')"
          class="h-10 w-full rounded-md border border-border bg-surface pl-9 pr-3 text-[13px] font-normal placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </span>
    </label>
    <div
      class="mt-2 max-h-40 overflow-y-auto"
      role="group"
      [attr.aria-label]="t('access-student-label')"
    >
      @for (student of matches(); track student.id) {
        <button
          type="button"
          [disabled]="disabled()"
          (click)="selectedChange.emit(student.id)"
          [attr.aria-pressed]="selected() === student.id"
          class="flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-left hover:bg-input disabled:opacity-50"
          [class.bg-primary-soft]="selected() === student.id"
        >
          <span
            class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-border text-text-muted"
            ><app-icon name="user" extra="h-4 w-4"
          /></span>
          <span class="min-w-0"
            ><span class="block truncate font-body text-xs font-semibold text-text">{{
              student.display_name
            }}</span>
            <span class="block truncate font-body text-[11px] text-text-muted">{{
              student.login
            }}</span></span
          >
        </button>
      } @empty {
        <p class="py-3 font-body text-xs text-text-muted">{{ t('access-no-matches') }}</p>
      }
    </div>
  `,
})
export class StudentPicker {
  readonly students = input.required<UserResponse[]>();
  readonly selected = input('');
  readonly disabled = input(false);
  readonly selectedChange = output<string>();
  readonly query = signal('');
  private readonly i18n = inject(I18nService);
  readonly matches = computed(() => {
    const query = this.query().trim().toLowerCase();
    return this.students().filter((s) =>
      `${s.display_name} ${s.login}`.toLowerCase().includes(query),
    );
  });
  t(key: string) {
    return this.i18n.format(key);
  }
}
