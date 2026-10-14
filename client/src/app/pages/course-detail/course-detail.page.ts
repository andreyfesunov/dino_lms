import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { CourseDetail, UserResponse } from '../../core/api.types';
import { SessionStore } from '../../core/session.store';
import { I18nService } from '../../core/i18n.service';
import { Icon } from '../../shared/icon';
import { StudentPicker } from '../../shared/student-picker';
import { DialogFocus } from '../../shared/dialog-focus';

@Component({
  selector: 'app-course-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon, RouterLink, StudentPicker, DialogFocus],
  template: `
    @if (error()) {
      <p role="alert" class="rounded-md bg-danger/10 p-4 text-danger">{{ error() }}</p>
    }
    @if (!model() && !error()) {
      <section class="design-page">
        <p role="status" class="text-sm text-text-muted">{{ t('page-loading') }}</p>
      </section>
    }
    @if (model(); as m) {
      <section class="design-page course-detail">
        <div class="course-header flex flex-col gap-5">
          <div class="flex items-center justify-between gap-4">
            <a
              routerLink="/courses"
              class="inline-flex items-center gap-2 font-body text-[13px] text-text-secondary hover:text-text"
            >
              <app-icon name="arrow-left" extra="h-4 w-4" />
              {{ t('course-back') }}
            </a>
          </div>

          <div class="course-overview flex flex-col gap-3">
            <div class="flex flex-wrap items-center gap-3">
              <h1 class="font-heading text-[26px] font-bold text-text">
                {{ m.course.title }}
              </h1>
              <span
                class="inline-flex items-center gap-1 rounded bg-primary-soft px-2 py-0.5 font-body text-[11px] font-semibold text-primary"
              >
                <app-icon name="unlock" extra="h-3 w-3" />
                {{ t('course-open-for-you') }}
              </span>
            </div>
            @if (m.course.description) {
              <p class="course-description max-w-3xl font-body text-sm text-text-secondary">
                {{ m.course.description }}
              </p>
            }
            <div class="course-stats flex flex-wrap items-center gap-4 text-text-muted">
              <span class="flex items-center gap-1.5 font-body text-[13px]">
                <app-icon name="book-open" extra="h-4 w-4" />
                {{ t('course-chapters', { count: m.chapters.length }) }}
              </span>
              <span class="flex items-center gap-1.5 font-body text-[13px]">
                <app-icon name="file-text" extra="h-4 w-4" />
                {{ t('course-lessons', { count: m.course.total_lessons }) }}
              </span>
              @if (m.course.estimated_hours; as hours) {
                <span class="flex items-center gap-1.5 font-body text-[13px]">
                  <app-icon name="clock" extra="h-4 w-4" />
                  {{ t('course-hours', { hours }) }}
                </span>
              }
            </div>
          </div>

          <div class="course-progress flex flex-col gap-1.5">
            <div class="flex items-center justify-between">
              <span class="font-body text-xs text-text-muted">
                {{ t('course-your-progress') }}
              </span>
              <span class="font-body text-[13px] font-semibold text-primary">
                {{ t('course-progress-done', { percent: m.course.progress }) }}
              </span>
            </div>
            <span class="inline-block h-2 w-full overflow-hidden rounded bg-input">
              <span
                class="block h-full rounded bg-primary"
                [style.width.%]="m.course.progress"
              ></span>
            </span>
          </div>
        </div>
        <div class="course-chapters flex flex-col gap-3">
          <div class="chapter-section-heading flex flex-wrap items-center justify-between gap-3">
            <h2 class="font-heading text-lg font-bold text-text">
              {{ t('course-chapters-title') }}
            </h2>
            @if (session.isAdmin()) {
              <button
                type="button"
                (click)="openManage()"
                [attr.aria-label]="t('course-manage-access')"
                class="inline-flex items-center gap-2 rounded-md border border-border px-3.5 py-2 font-body text-xs font-medium text-text-secondary hover:bg-input"
              >
                <app-icon name="key" extra="h-3.5 w-3.5" />
                <span class="hidden sm:inline">{{ t('course-manage-access') }}</span>
              </button>
            }
          </div>

          <div class="flex flex-col gap-3">
            @for (chapter of m.chapters; track chapter.id) {
              <div
                [class]="
                  chapter.state === 'open'
                    ? 'chapter-card rounded-md border border-border bg-surface px-4 py-3.5'
                    : 'chapter-card rounded-md border border-[#F3E0C8] bg-[#FFFBEB]/60 px-4 py-3.5'
                "
              >
                <div class="flex items-center justify-between gap-4">
                  <div class="flex min-w-0 items-center gap-3">
                    <span
                      [class]="
                        chapter.state === 'open'
                          ? 'inline-flex h-8 w-8 items-center justify-center rounded-md bg-primary font-heading text-[15px] font-bold text-text-inverse'
                          : 'inline-flex h-8 w-8 items-center justify-center rounded-md bg-[#FEF3C7] font-heading text-[15px] font-bold text-[#D97706]'
                      "
                    >
                      {{ $index + 1 }}
                    </span>
                    <div class="min-w-0">
                      <div class="flex items-center gap-2">
                        <span
                          [class]="
                            chapter.state === 'open'
                              ? 'font-body text-[15px] font-semibold text-text'
                              : 'font-body text-[15px] font-semibold text-text-muted'
                          "
                        >
                          {{ chapter.title }}
                        </span>
                        @if (chapter.progress === 100 && chapter.lessons.length > 0) {
                          <span class="text-primary" [title]="t('course-lesson-done')">
                            <app-icon name="check-circle" extra="h-4 w-4" />
                          </span>
                        } @else if (chapter.state !== 'open') {
                          <span class="text-[#D97706]">
                            <app-icon name="lock" extra="h-4 w-4" />
                          </span>
                        }
                      </div>
                      <span
                        [class]="
                          chapter.state === 'open'
                            ? 'font-body text-xs text-text-muted'
                            : 'font-body text-xs text-[#D97706]'
                        "
                      >
                        @if (chapter.state === 'open') {
                          {{ t('course-lessons', { count: chapter.lessons.length }) }} ·
                        }
                        {{
                          chapter.state === 'open'
                            ? t('course-chapter-access-open')
                            : t('course-chapter-access-locked')
                        }}
                      </span>
                    </div>
                  </div>
                  @if (chapter.state === 'open') {
                    <button
                      type="button"
                      (click)="toggleExpanded(chapter.id)"
                      [attr.aria-expanded]="expandedChapter() === chapter.id"
                      [attr.aria-controls]="'chapter-lessons-' + chapter.id"
                      [attr.aria-label]="t('course-chapter-open') + ': ' + chapter.title"
                      class="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 font-body text-xs font-semibold text-text-inverse hover:bg-inverse"
                    >
                      <span class="hidden sm:inline">{{ t('course-chapter-open') }}</span>
                      <app-icon
                        [name]="expandedChapter() === chapter.id ? 'chevron-down' : 'chevron-right'"
                        extra="h-3.5 w-3.5"
                      />
                    </button>
                  }
                </div>
                @if (chapter.state === 'open' && expandedChapter() === chapter.id) {
                  <div
                    [id]="'chapter-lessons-' + chapter.id"
                    class="mt-4 flex flex-col gap-2 border-t border-border pt-3"
                  >
                    @if (chapter.lessons.length === 0) {
                      <p class="py-2 text-sm text-text-muted">{{ t('course-chapter-empty') }}</p>
                    }
                    @for (lesson of chapter.lessons; track lesson.id) {
                      @if (chapter.state === 'open') {
                        <a
                          [routerLink]="
                            '/courses/' + m.course.id + '/' + chapter.id + '/' + lesson.id
                          "
                          class="flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-input"
                        >
                          <app-icon
                            [name]="lesson.type === 'call' ? 'clock' : 'file-text'"
                            extra="h-4 w-4"
                          />
                          <span>{{ lesson.title }}</span>
                          @if (lesson.type === 'call') {
                            <span
                              class="rounded bg-primary-soft px-2 py-0.5 text-xs text-primary"
                              >{{ t('course-lesson-call') }}</span
                            >
                          }
                          @if (lesson.done) {
                            <app-icon name="check-circle" extra="h-4 w-4 text-primary" />
                          }
                        </a>
                      }
                    }
                  </div>
                }
              </div>
            }
          </div>
        </div>
        @if (manageOpen()) {
          <div class="fixed inset-0 z-50 flex items-center justify-center bg-[#1B3A28]/40 p-4">
            <div
              appDialogFocus
              role="dialog"
              aria-modal="true"
              aria-labelledby="chapter-access-title"
              class="flex max-h-[calc(100dvh-2rem)] w-full max-w-[520px] flex-col overflow-hidden rounded-xl bg-surface shadow-[0_8px_32px_#00000022]"
            >
              <div class="flex flex-col gap-3 px-6 py-5">
                <div class="flex items-start justify-between gap-3">
                  <div class="flex items-center gap-2.5">
                    <span
                      class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#FEF3C7] text-[#D97706]"
                      ><app-icon name="key" extra="h-[18px] w-[18px]"
                    /></span>
                    <div class="min-w-0">
                      <h2
                        id="chapter-access-title"
                        class="font-heading text-[17px] font-bold text-text"
                      >
                        {{ t('access-chapter-title') }}
                      </h2>
                      <p class="mt-0.5 font-body text-xs text-text-muted">{{ m.course.title }}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    [disabled]="accessBusy()"
                    [attr.aria-label]="t('access-close')"
                    (click)="closeManage()"
                    class="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-input text-text-secondary"
                  >
                    <app-icon name="x" extra="h-4 w-4" />
                  </button>
                </div>
                @if (choosingStudent()) {
                  <app-student-picker
                    [students]="studentList()"
                    [selected]="studentId()"
                    [disabled]="accessBusy() || accessLoading()"
                    (selectedChange)="onStudentChange($event)"
                  />
                } @else if (currentStudent(); as student) {
                  <div
                    class="flex items-center gap-2 rounded-md bg-input px-3 py-2 font-body text-xs"
                  >
                    <app-icon name="user" extra="h-4 w-4 shrink-0 text-text-muted" />
                    <span class="text-text-secondary">{{ t('access-student-bar') }}</span>
                    <span
                      class="min-w-0 flex-1 truncate font-semibold text-text"
                      [title]="student.display_name + ' (' + student.login + ')'"
                      >{{ student.display_name }} ({{ student.login }})</span
                    >
                    <button
                      type="button"
                      [disabled]="accessBusy() || accessLoading()"
                      (click)="choosingStudent.set(true)"
                      class="shrink-0 rounded-full border border-border px-2.5 py-1 text-[10px] text-text-secondary"
                    >
                      {{ t('access-change') }}
                    </button>
                  </div>
                }
              </div>
              <div class="min-h-0 flex-1 overflow-y-auto px-6 pb-4">
                @if (accessError()) {
                  <p role="alert" class="mb-3 text-sm text-danger">{{ accessError() }}</p>
                  <button
                    type="button"
                    [disabled]="accessBusy() || accessLoading()"
                    (click)="onStudentChange(studentId())"
                    class="mb-3 text-sm text-primary underline"
                  >
                    {{ t('access-retry') }}
                  </button>
                }
                @if (!studentList().length) {
                  <p class="font-body text-sm text-text-muted">{{ t('access-empty') }}</p>
                } @else if (studentId() && !choosingStudent()) {
                  <div class="flex flex-col gap-0.5">
                    @for (chapter of m.chapters; track chapter.id) {
                      <div
                        class="flex items-center gap-3 rounded-sm px-3.5 py-3"
                        [class.bg-[#F0FDF4]]="isChapterOpen(chapter.id)"
                        [class.bg-[#FFFBEB]]="!isChapterOpen(chapter.id)"
                      >
                        <span
                          class="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] font-heading text-xs font-bold text-white"
                          [class.bg-primary]="isChapterOpen(chapter.id)"
                          [class.bg-[#D97706]]="!isChapterOpen(chapter.id)"
                          >{{ $index + 1 }}</span
                        >
                        <div class="min-w-0 flex-1">
                          <div class="flex flex-wrap items-center gap-1.5">
                            <span class="font-body text-[13px] font-semibold text-text">{{
                              chapter.title
                            }}</span>
                            <span
                              class="rounded px-1.5 py-0.5 font-body text-[10px]"
                              [class.bg-[#D1FAE5]]="isChapterOpen(chapter.id)"
                              [class.text-primary]="isChapterOpen(chapter.id)"
                              [class.bg-[#FEF3C7]]="!isChapterOpen(chapter.id)"
                              [class.text-[#D97706]]="!isChapterOpen(chapter.id)"
                              >{{
                                isChapterOpen(chapter.id)
                                  ? t('access-chapter-open-badge')
                                  : t('access-chapter-closed-badge')
                              }}</span
                            >
                          </div>
                          <p class="mt-0.5 font-body text-[11px] text-text-muted">
                            {{
                              isChapterOpen(chapter.id)
                                ? t('access-chapter-open-hint')
                                : t('access-chapter-closed-hint')
                            }}
                          </p>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          [attr.aria-label]="chapter.title"
                          [attr.aria-checked]="isChapterOpen(chapter.id)"
                          [disabled]="accessBusy() || accessLoading() || !!accessError()"
                          (click)="toggleChapter(chapter.id, !isChapterOpen(chapter.id))"
                          class="flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50"
                          [class.bg-primary]="isChapterOpen(chapter.id)"
                          [class.bg-border]="!isChapterOpen(chapter.id)"
                        >
                          <span
                            class="h-5 w-5 rounded-full bg-white shadow-sm transition-transform"
                            [class.translate-x-5]="isChapterOpen(chapter.id)"
                          ></span>
                        </button>
                      </div>
                    }
                  </div>
                }
              </div>
              <div
                class="flex flex-wrap items-center justify-between gap-3 border-t border-border px-6 py-4"
              >
                <p
                  role="status"
                  class="flex items-center gap-1 font-body text-[11px] text-text-muted"
                >
                  <app-icon name="clock" extra="h-3 w-3" />{{
                    accessBusy() ? t('access-saving') : t('access-saved-hint')
                  }}
                </p>
                <div class="flex gap-3">
                  @if (studentId()) {
                    <button
                      type="button"
                      [disabled]="accessBusy() || accessLoading()"
                      (click)="revokeAccess()"
                      class="font-body text-xs text-danger disabled:opacity-50"
                    >
                      {{ t('access-revoke') }}
                    </button>
                  }
                  <button
                    type="button"
                    [disabled]="accessBusy()"
                    (click)="closeManage()"
                    class="font-body text-[13px] font-medium text-text-secondary"
                  >
                    {{ t('access-close') }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        }
      </section>
    }
  `,
})
export class CourseDetailPage {
  readonly session = inject(SessionStore);
  private api = inject(ApiService);
  private i18n = inject(I18nService);

  readonly model = signal<CourseDetail | null>(null);
  readonly error = signal<string | null>(null);
  readonly expandedChapter = signal<string | null>(null);
  toggleExpanded(id: string): void {
    this.expandedChapter.update((current) => (current === id ? null : id));
  }
  readonly manageOpen = signal(false);
  readonly studentId = signal('');
  readonly studentList = signal<UserResponse[]>([]);
  readonly openChapters = signal<string[]>([]);
  readonly accessBusy = signal(false);
  readonly accessLoading = signal(false);
  readonly accessError = signal<string | null>(null);
  readonly choosingStudent = signal(false);
  readonly currentStudent = computed(() =>
    this.studentList().find((s) => s.id === this.studentId()),
  );
  private courseId = '';

  t(key: string, args?: Record<string, unknown>): string {
    return this.i18n.format(key, args);
  }

  async ngOnInit(): Promise<void> {
    try {
      const path = location.pathname.split('/').filter(Boolean);
      this.courseId = path[1] ?? '';
      const model = await this.api.course(this.courseId);
      this.model.set(model);
      if (this.session.isAdmin()) {
        const [students, users] = await Promise.all([
          this.api.courseStudents(this.courseId),
          this.api.users(),
        ]);
        this.studentList.set(users.users.filter((user) => students.students.includes(user.id)));
        const firstStudent = this.studentList()[0];
        if (firstStudent) {
          await this.onStudentChange(firstStudent.id);
        }
      }
    } catch {
      this.error.set(this.t('error-generic'));
    }
  }

  async openManage(): Promise<void> {
    this.accessError.set(null);
    this.choosingStudent.set(!this.studentId());
    this.manageOpen.set(true);
    if (this.studentId()) await this.onStudentChange(this.studentId());
  }

  @HostListener('document:keydown.escape')
  closeManage(): void {
    if (!this.accessBusy()) this.manageOpen.set(false);
  }

  async onStudentChange(studentId: string): Promise<void> {
    if (this.accessBusy()) return;
    this.studentId.set(studentId);
    this.openChapters.set([]);
    this.accessLoading.set(true);
    this.accessError.set(null);
    try {
      const chapters = await this.api.studentChapters(this.courseId, studentId);
      if (this.studentId() === studentId) {
        this.openChapters.set(chapters.open_chapters);
        this.choosingStudent.set(false);
      }
    } catch {
      if (this.studentId() === studentId) this.accessError.set(this.t('error-generic'));
    } finally {
      if (this.studentId() === studentId) this.accessLoading.set(false);
    }
  }

  isChapterOpen(chapterId: string): boolean {
    const open = this.openChapters();
    return open.includes('*') || open.includes(chapterId);
  }

  async toggleChapter(chapterId: string, open: boolean): Promise<void> {
    if (!this.studentId() || this.accessBusy() || this.accessLoading()) {
      return;
    }
    try {
      this.accessBusy.set(true);
      this.accessError.set(null);
      const result = await this.api.setStudentChapter(
        this.courseId,
        this.studentId(),
        chapterId,
        open,
      );
      this.openChapters.set(result.open_chapters);
    } catch {
      this.accessError.set(this.t('error-generic'));
    } finally {
      this.accessBusy.set(false);
    }
  }

  async revokeAccess(): Promise<void> {
    if (!this.studentId() || this.accessBusy() || this.accessLoading()) return;
    this.accessBusy.set(true);
    this.accessError.set(null);
    try {
      await this.api.revokeCourse(this.courseId, this.studentId());
      this.studentList.update((students) => students.filter((s) => s.id !== this.studentId()));
      this.studentId.set('');
      this.openChapters.set([]);
      this.choosingStudent.set(true);
    } catch {
      this.accessError.set(this.t('error-generic'));
    } finally {
      this.accessBusy.set(false);
    }
  }
}
