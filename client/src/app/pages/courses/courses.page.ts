import { ChangeDetectionStrategy, Component, HostListener, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { CourseListItem, UserResponse } from '../../core/api.types';
import { SessionStore } from '../../core/session.store';
import { I18nService } from '../../core/i18n.service';
import { Icon } from '../../shared/icon';
import { StudentPicker } from '../../shared/student-picker';
import { DialogFocus } from '../../shared/dialog-focus';

interface CourseRow {
  course: CourseListItem;
  open: boolean;
}

@Component({
  selector: 'app-courses',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, Icon, RouterLink, StudentPicker, DialogFocus],
  template: `
    <section class="design-page">
      <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div class="flex flex-col gap-1">
          <h1 class="font-heading text-2xl font-bold text-text md:text-[28px]">
            {{ t('courses-title') }}
          </h1>
          <p class="font-body text-sm text-text-secondary">{{ t('courses-subtitle') }}</p>
        </div>
        @if (session.isAdmin()) {
          <button
            type="button"
            (click)="openGrant()"
            class="inline-flex items-center justify-center gap-2 rounded-md border border-border px-4 py-2.5 font-body text-sm font-medium text-text-secondary hover:bg-input"
          >
            <app-icon name="user-plus" extra="h-4 w-4" />
            <span>{{ t('courses-grant-access') }}</span>
          </button>
        }
      </div>

      <div class="flex flex-col gap-3 lg:flex-row lg:items-center">
        <label class="relative block w-full lg:w-[280px]">
          <span
            class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
          >
            <app-icon name="search" extra="h-4 w-4" />
          </span>
          <input
            type="search"
            [placeholder]="t('courses-search-placeholder')"
            [(ngModel)]="search"
            class="h-[37px] w-full rounded-md border-0 bg-input py-2.5 pl-10 pr-3 font-body text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </label>
        <div class="flex flex-wrap gap-2">
          <button type="button" [class]="chipClass(filter() === 0)" (click)="filter.set(0)">
            {{ t('courses-filter-all') }}
          </button>
          <button type="button" [class]="chipClass(filter() === 1)" (click)="filter.set(1)">
            {{ t('courses-filter-active') }}
          </button>
          <button type="button" [class]="chipClass(filter() === 2)" (click)="filter.set(2)">
            {{ t('courses-filter-archived') }}
          </button>
        </div>
      </div>

      @if (!loading() && !error() && rows().length === 0) {
        <div
          class="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-16 text-center"
        >
          <span class="text-text-muted"><app-icon name="graduation-cap" extra="h-10 w-10" /></span>
          <p class="font-body text-base font-medium text-text">{{ t('courses-empty') }}</p>
          <p class="font-body text-sm text-text-muted">{{ t('courses-empty-hint') }}</p>
        </div>
      }

      @if (loading()) { <p role="status" class="text-sm text-text-muted">{{ t('page-loading') }}</p> }
      @if (error()) { <p role="alert" class="rounded-md bg-danger/10 p-3 text-sm text-danger">{{ error() }}</p> }
      <div class="grid grid-cols-1 gap-4">
        @for (row of rows(); track row.course.id) {
          <a
            [routerLink]="'/courses/' + row.course.id"
            class="course-card group flex min-w-0 flex-col justify-between rounded-lg border border-border bg-surface p-5 transition-colors hover:border-primary/40 hover:bg-input/40"
          >
            <div class="flex items-start justify-between gap-4">
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2">
                  <h2 class="font-heading text-lg font-bold text-text group-hover:text-primary">
                    {{ row.course.title }}
                  </h2>
                  <span
                    class="inline-flex items-center gap-1 rounded px-2 py-0.5 font-body text-[11px] font-semibold"
                    [class]="badgeClass(row)"
                  >
                    <app-icon [name]="badgeIcon(row)" extra="h-3 w-3" />
                    {{ badgeLabel(row) }}
                  </span>
                </div>
                @if (row.course.description) {
                  <p
                    class="mt-1 max-w-[600px] line-clamp-2 font-body text-[13px] text-text-secondary"
                  >
                    {{ row.course.description }}
                  </p>
                }
              </div>
              <span class="text-text-muted transition-colors group-hover:text-primary">
                <app-icon name="chevron-right" extra="h-5 w-5" />
              </span>
            </div>
            <div class="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div class="flex items-center gap-4 text-text-muted">
                <span class="flex items-center gap-1.5 font-body text-xs">
                  <app-icon name="book-open" extra="h-3.5 w-3.5" />
                  {{ chaptersLabel(row) }}
                </span>
                @if (row.course.students > 0) {
                  <span class="flex items-center gap-1.5 font-body text-xs">
                    <app-icon name="users" extra="h-3.5 w-3.5" />
                    {{ studentsLabel(row.course.students) }}
                  </span>
                }
              </div>
              <div class="flex items-center gap-2">
                <span class="font-body text-[11px] text-text-muted">
                  {{ t('courses-progress-label') }}
                </span>
                <span class="font-body text-[11px] font-semibold text-primary">
                  {{ row.course.progress }}%
                </span>
                <span class="inline-block h-1.5 w-32 overflow-hidden rounded-full bg-input">
                  <span
                    class="block h-full rounded-full bg-primary"
                    [style.width.%]="row.course.progress"
                  ></span>
                </span>
              </div>
            </div>
          </a>
        }
      </div>

      @if (modal() === 1 && session.isAdmin()) {
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-[#1B3A28]/40 p-4">
          <div
            appDialogFocus
            role="dialog"
            aria-modal="true"
            aria-labelledby="grant-title"
            (keydown.escape)="closeGrant()"
            class="flex max-h-[calc(100dvh-2rem)] w-full max-w-[480px] flex-col overflow-hidden rounded-xl bg-surface shadow-[0_8px_32px_#00000022]"
          >
            <div class="flex items-start justify-between gap-3 px-6 py-5">
              <div class="flex items-center gap-2.5">
                <span
                  class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary"
                  ><app-icon name="user-plus" extra="h-[18px] w-[18px]"
                /></span>
                <div>
                  <h2 id="grant-title" class="font-heading text-[17px] font-bold text-text">
                    {{ t('access-grant-title') }}
                  </h2>
                  <p class="mt-0.5 font-body text-xs text-text-muted">
                    {{ t('access-grant-sub') }}
                  </p>
                </div>
              </div>
              <button
                type="button"
                [disabled]="grantBusy()"
                [attr.aria-label]="t('access-close')"
                (click)="closeGrant()"
                class="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-input text-text-secondary"
              >
                <app-icon name="x" extra="h-4 w-4" />
              </button>
            </div>
            <div class="flex flex-col gap-4 overflow-y-auto px-6 pb-5">
              @if (grantError()) {
                <p role="alert" class="text-sm text-danger">{{ grantError() }}</p>
              }
              <app-student-picker
                [students]="students()"
                [selected]="grantStudent()"
                [disabled]="grantBusy()"
                (selectedChange)="grantStudent.set($event)"
              />
              <label class="flex flex-col gap-1.5 font-body text-xs font-semibold text-text">
                {{ t('access-course-label') }}
                <select
                  [(ngModel)]="grantCourse"
                  [attr.aria-label]="t('access-course-label')"
                  [disabled]="grantBusy()"
                  class="h-10 rounded-md border border-border bg-surface px-3 text-[13px] font-normal focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  @for (course of allCourses(); track course.id) {
                    <option [value]="course.id">{{ course.title }}</option>
                  }
                </select>
              </label>
              <p class="rounded-md bg-input px-3.5 py-3 font-body text-xs text-text-secondary">
                {{ t('access-default-hint') }}
              </p>
            </div>
            <div class="flex justify-end gap-2.5 border-t border-border px-6 py-4">
              <button
                type="button"
                [disabled]="grantBusy()"
                (click)="closeGrant()"
                class="rounded-md px-4 py-2 font-body text-[13px] font-medium text-text-secondary"
              >
                {{ t('action-cancel') }}
              </button>
              <button
                type="button"
                [disabled]="grantBusy() || !grantStudent() || !grantCourse()"
                (click)="submitGrant()"
                class="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 font-body text-[13px] font-semibold text-text-inverse hover:bg-inverse disabled:opacity-50"
              >
                <app-icon name="check-circle" extra="h-4 w-4" />{{ t('access-grant-submit') }}
              </button>
            </div>
          </div>
        </div>
      }
    </section>
  `,
})
export class CoursesPage {
  readonly session = inject(SessionStore);
  private api = inject(ApiService);
  private i18n = inject(I18nService);

  readonly loading = signal(true);
  readonly search = signal('');
  readonly filter = signal<0 | 1 | 2>(0); // 0 all, 1 active, 2 archived
  readonly modal = signal(0);
  readonly allCourses = signal<CourseListItem[]>([]);
  readonly students = signal<UserResponse[]>([]);
  readonly grantStudent = signal('');
  readonly grantCourse = signal('');
  readonly grantBusy = signal(false);
  readonly grantError = signal<string | null>(null);
  readonly error = signal<string | null>(null);

  private readonly loaded = signal<CourseListItem[]>([]);

  openGrant(): void {
    this.grantStudent.set('');
    this.grantCourse.set(this.allCourses()[0]?.id ?? '');
    this.grantError.set(null);
    this.modal.set(1);
  }

  @HostListener('document:keydown.escape')
  closeGrant(): void {
    if (!this.grantBusy()) this.modal.set(0);
  }

  rows(): CourseRow[] {
    const query = this.search().trim().toLowerCase();
    const current = this.filter();
    return this.loaded()
      .filter((course) => {
        const matchesFilter =
          current === 1 ? !course.archived : current === 2 ? course.archived : true;
        const matchesQuery =
          query === '' ||
          course.title.toLowerCase().includes(query) ||
          course.description.toLowerCase().includes(query);
        return matchesFilter && matchesQuery;
      })
      .map((course) => ({ course, open: course.progress >= 0 && !course.archived }));
  }

  t(key: string, args?: Record<string, unknown>): string {
    return this.i18n.format(key, args);
  }

  async ngOnInit(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const result = await this.api.courses();
      this.loaded.set(result.courses);
      this.allCourses.set(result.courses);
      if (this.session.isAdmin()) {
        const users = await this.api.users();
        this.students.set(users.users.filter((u) => u.role === 'student'));
      }
    } catch {
      this.error.set(this.t('error-generic'));
    } finally { this.loading.set(false); }
  }

  async submitGrant(): Promise<void> {
    if (this.grantBusy()) return;
    const student = this.grantStudent().trim();
    const course = this.grantCourse().trim();
    if (!student || !course) {
      this.error.set(this.t('error-generic'));
      return;
    }
    try {
      this.grantBusy.set(true);
      this.grantError.set(null);
      await this.api.assignCourse(course, student);
      await this.ngOnInit();
      this.modal.set(0);
    } catch (e) {
      this.grantError.set(this.t('error-generic'));
    } finally {
      this.grantBusy.set(false);
    }
  }

  chipClass(active: boolean): string {
    return active
      ? 'rounded-full bg-primary px-3.5 py-1.5 font-body text-sm font-medium text-text-inverse'
      : 'rounded-full bg-input px-3.5 py-1.5 font-body text-sm font-medium text-text-secondary hover:bg-border';
  }

  badgeClass(row: CourseRow): string {
    if (row.course.archived) {
      return 'bg-[#F3E0C8] text-[#8A5A2B]';
    }
    return row.open ? 'bg-primary-soft text-primary' : 'bg-[#FEF3C7] text-[#D97706]';
  }

  badgeIcon(row: CourseRow): 'unlock' | 'lock' {
    return !row.course.archived && row.open ? 'unlock' : 'lock';
  }

  badgeLabel(row: CourseRow): string {
    if (row.course.archived) {
      return this.t('courses-archived-badge');
    }
    return row.open ? this.t('courses-open-badge') : this.t('courses-locked-badge');
  }

  chaptersLabel(row: CourseRow): string {
    return this.t('courses-chapters-count', { count: row.course.total_chapters });
  }

  studentsLabel(count: number): string {
    return this.t('courses-students-count', { count });
  }
}
