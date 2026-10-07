import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { CourseDetail, UserResponse } from '../../core/api.types';
import { SessionStore } from '../../core/session.store';
import { I18nService } from '../../core/i18n.service';
import { Icon } from '../../shared/icon';

@Component({
  selector: 'app-course-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, Icon],
  template: `
    @if (error()) {
      <p role="alert" class="rounded-md bg-danger/10 p-4 text-danger">{{ error() }}</p>
    }
    @if (model(); as m) {
      <section
        class="flex h-full min-h-[calc(100vh-2rem)] flex-col gap-6 rounded-xl bg-surface p-5 shadow-[0_4px_24px_rgba(27,58,40,0.06)] md:p-8"
      >
        <div class="flex items-center justify-between gap-4">
          <a
            href="/courses"
            class="inline-flex items-center gap-2 font-body text-[13px] text-text-secondary hover:text-text"
          >
            <app-icon name="arrow-left" extra="h-4 w-4" />
            {{ t('course-back') }}
          </a>
          @if (session.isAdmin()) {
            <button
              type="button"
              (click)="openManage()"
              class="inline-flex items-center gap-2 rounded-md border border-border px-3.5 py-2 font-body text-xs font-medium text-text-secondary hover:bg-input"
            >
              <app-icon name="key" extra="h-3.5 w-3.5" />
              {{ t('course-manage-access') }}
            </button>
          }
        </div>

        <div class="flex flex-col gap-3">
          <div class="flex flex-wrap items-center gap-3">
            <h1 class="font-heading text-[26px] font-semibold text-text">
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
            <p class="max-w-3xl font-body text-sm text-text-secondary">
              {{ m.course.description }}
            </p>
          }
          <div class="flex flex-wrap items-center gap-4 text-text-muted">
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

        <div class="flex flex-col gap-1.5">
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

        @if (firstOpen(m); as link) {
          <a
            [href]="link"
            class="inline-flex w-fit items-center gap-2 rounded-md bg-primary px-4 py-2.5 font-body text-sm font-semibold text-text-inverse hover:bg-inverse"
          >
            {{ t('course-chapter-open') }}
            <app-icon name="chevron-right" extra="h-4 w-4" />
          </a>
        }

        <h2 class="font-heading text-lg font-semibold text-text">
          {{ t('course-chapters-title') }}
        </h2>

        <div class="flex flex-col gap-3">
          @for (chapter of m.chapters; track chapter.id) {
            <div
              [class]="
                chapter.state === 'open'
                  ? 'rounded-lg border border-border bg-surface p-4'
                  : 'rounded-lg border border-[#F3E0C8] bg-[#FFFBEB]/60 p-4'
              "
            >
              <div class="flex items-center justify-between gap-4">
                <div class="flex min-w-0 items-center gap-3">
                  <span
                    [class]="
                      chapter.state === 'open'
                        ? 'inline-flex h-9 w-9 items-center justify-center rounded-md bg-primary font-heading text-[15px] font-bold text-text-inverse'
                        : 'inline-flex h-9 w-9 items-center justify-center rounded-md bg-[#D97706] font-heading text-[15px] font-bold text-white'
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
                      {{ t('course-lessons', { count: chapter.lessons.length }) }} ·
                      {{
                        chapter.state === 'open'
                          ? t('course-chapter-access-open')
                          : t('course-chapter-access-locked')
                      }}
                    </span>
                  </div>
                </div>
                @if (chapter.state === 'open' && chapter.lessons.length > 0) {
                  <a
                    [href]="
                      '/courses/' + m.course.id + '/' + chapter.id + '/' + chapter.lessons[0].id
                    "
                    class="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 font-body text-xs font-semibold text-text-inverse hover:bg-inverse"
                  >
                    {{ t('course-chapter-open') }}
                    <app-icon name="chevron-right" extra="h-3.5 w-3.5" />
                  </a>
                } @else {
                  <span
                    class="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border px-3.5 py-2 font-body text-xs font-medium text-text-secondary"
                  >
                    {{ t('course-chapter-request') }}
                  </span>
                }
              </div>
              <div class="mt-4 flex flex-col gap-2 border-t border-border pt-3">
                @for (lesson of chapter.lessons; track lesson.id) {
                  @if (chapter.state === 'open') {
                    <a
                      [href]="'/courses/' + m.course.id + '/' + chapter.id + '/' + lesson.id"
                      class="flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-input"
                    >
                      <app-icon
                        [name]="lesson.type === 'call' ? 'clock' : 'file-text'"
                        extra="h-4 w-4"
                      />
                      <span>{{ lesson.title }}</span>
                      @if (lesson.type === 'call') {
                        <span class="rounded bg-primary-soft px-2 py-0.5 text-xs text-primary">{{
                          t('course-lesson-call')
                        }}</span>
                      }
                      @if (lesson.done) {
                        <app-icon name="check-circle" extra="h-4 w-4 text-primary" />
                      }
                    </a>
                  }
                }
              </div>
            </div>
          }
        </div>

        @if (manageOpen()) {
          <div class="fixed inset-0 z-50 flex items-center justify-center bg-[#1B3A28]/40 p-4">
            <div class="w-full max-w-lg rounded-xl bg-surface p-6 shadow-xl">
              <div class="mb-4 flex items-start justify-between gap-4">
                <div>
                  <h2 class="font-heading text-xl font-semibold text-text">
                    {{
                      studentId()
                        ? t('access-modal-title', { name: studentName() })
                        : t('access-chapter-title')
                    }}
                  </h2>
                  <p class="mt-1 font-body text-sm text-text-secondary">
                    {{ m.course.title }}
                  </p>
                </div>
                <button
                  type="button"
                  class="rounded-md p-1 text-text-secondary hover:bg-input"
                  (click)="manageOpen.set(false)"
                >
                  <app-icon name="x" />
                </button>
              </div>

              <label class="flex flex-col gap-1.5 font-body text-[13px] font-medium text-text">
                {{ t('access-student-label') }}
                <select
                  [ngModel]="studentId()"
                  (ngModelChange)="onStudentChange($event)"
                  class="h-11 rounded-md border-0 bg-input px-3 font-body text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  @for (student of studentList(); track student.id) {
                    <option [value]="student.id">{{ student.display_name }}</option>
                  } @empty {
                    <option value="">{{ t('access-empty') }}</option>
                  }
                </select>
              </label>

              <div class="mt-3 flex flex-col gap-2">
                @for (chapter of m.chapters; track chapter.id) {
                  <label
                    class="flex items-center justify-between gap-3 rounded-md bg-input px-3 py-2"
                  >
                    <span class="font-body text-sm text-text">{{ chapter.title }}</span>
                    <input
                      type="checkbox"
                      [disabled]="!studentId()"
                      [checked]="isChapterOpen(chapter.id)"
                      (change)="toggleChapter(chapter.id, $any($event.target).checked)"
                      class="h-[18px] w-[18px] cursor-pointer rounded border-border accent-primary"
                    />
                  </label>
                }
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
  readonly manageOpen = signal(false);
  readonly studentId = signal('');
  readonly studentList = signal<UserResponse[]>([]);
  readonly studentName = computed(
    () => this.studentList().find((student) => student.id === this.studentId())?.display_name ?? '',
  );
  readonly openChapters = signal<string[]>([]);
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

  firstOpen(m: CourseDetail): string | null {
    const chapter = m.chapters.find((c) => c.state === 'open');
    if (!chapter) {
      return null;
    }
    const lesson = chapter.lessons.find((l) => !l.done) ?? chapter.lessons[0];
    if (!lesson) {
      return null;
    }
    return `/courses/${m.course.id}/${chapter.id}/${lesson.id}`;
  }

  async openManage(): Promise<void> {
    this.manageOpen.set(true);
  }

  async onStudentChange(studentId: string): Promise<void> {
    this.studentId.set(studentId);
    try {
      const chapters = await this.api.studentChapters(this.courseId, studentId);
      if (this.studentId() === studentId) {
        this.openChapters.set(chapters.open_chapters);
      }
    } catch {
      this.error.set(this.t('error-generic'));
    }
  }

  isChapterOpen(chapterId: string): boolean {
    const open = this.openChapters();
    return open.includes('*') || open.includes(chapterId);
  }

  async toggleChapter(chapterId: string, open: boolean): Promise<void> {
    if (!this.studentId()) {
      return;
    }
    try {
      const result = await this.api.setStudentChapter(
        this.courseId,
        this.studentId(),
        chapterId,
        open,
      );
      this.openChapters.set(result.open_chapters);
    } catch {
      this.error.set(this.t('error-generic'));
    }
  }
}
