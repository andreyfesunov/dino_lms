import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { CourseListItem, PracticeDashboard, PracticeStatus } from '../../core/api.types';
import { I18nService } from '../../core/i18n.service';
import { Icon } from '../../shared/icon';
import { Skeleton, Spinner } from '../../shared/loading';

@Component({
  selector: 'app-practices-review-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, Icon, Skeleton, Spinner],
  template: `
    <section class="design-page flex flex-col gap-5">
      <header class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div class="flex flex-col gap-1">
          <h1 class="font-heading text-2xl font-bold text-text sm:text-[28px]">
            {{ t('practice-review-title') }}
          </h1>
          <p class="font-body text-sm text-text-muted">{{ t('practice-review-subtitle') }}</p>
        </div>
        <label class="flex flex-col gap-1 font-body text-xs font-semibold text-text-secondary">
          {{ t('practice-course') }}
          <select
            [value]="selectedCourse()"
            (change)="selectCourse($any($event.target).value)"
            class="min-w-[220px] rounded-md border border-border bg-input px-3 py-2.5 text-sm text-text"
          >
            @for (course of courses(); track course.id) {
              <option [value]="course.id">{{ course.title }}</option>
            }
          </select>
        </label>
      </header>

      @if (error()) {
        <p role="alert" class="rounded-md bg-danger/10 p-3 text-sm text-danger">{{ error() }}</p>
      }
      @if (loading()) {
        <div
          class="flex flex-col gap-5"
          role="status"
          [attr.aria-label]="t('page-loading')"
          aria-hidden="false"
        >
          <div class="grid grid-cols-2 gap-3 xl:grid-cols-4" aria-hidden="true">
            @for (card of [1, 2, 3, 4]; track card) {
              <div class="flex flex-col gap-3 rounded-lg bg-input p-4">
                <app-skeleton class="h-3 w-2/3 rounded" /><app-skeleton class="h-8 w-12 rounded" />
              </div>
            }
          </div>
          <div
            class="grid gap-5 xl:grid-cols-[minmax(280px,0.85fr)_minmax(0,1.4fr)]"
            aria-hidden="true"
          >
            <div class="flex flex-col gap-3 rounded-lg border border-border p-4">
              <app-skeleton class="mb-2 h-5 w-32 rounded" />
              @for (row of [1, 2, 3]; track row) {
                <app-skeleton class="h-16 w-full rounded-md" />
              }
            </div>
            <div class="flex flex-col gap-3 rounded-lg border border-border p-4">
              <app-skeleton class="mb-2 h-5 w-40 rounded" />
              @for (row of [1, 2]; track row) {
                <app-skeleton class="h-36 w-full rounded-md" />
              }
            </div>
          </div>
        </div>
      } @else if (dashboard(); as data) {
        <div class="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <article class="rounded-lg bg-input p-4">
            <p class="font-body text-xs text-text-muted">{{ t('practice-metric-students') }}</p>
            <p class="mt-1 font-heading text-2xl font-bold text-primary">
              {{ data.metrics.students }}
            </p>
          </article>
          <article class="rounded-lg bg-input p-4">
            <p class="font-body text-xs text-text-muted">{{ t('practice-metric-progress') }}</p>
            <p class="mt-1 font-heading text-2xl font-bold text-primary">
              {{ data.metrics.average_progress }}%
            </p>
          </article>
          <article class="rounded-lg bg-input p-4">
            <p class="font-body text-xs text-text-muted">{{ t('practice-metric-pending') }}</p>
            <p class="mt-1 font-heading text-2xl font-bold text-[#D97706]">
              {{ data.metrics.pending }}
            </p>
          </article>
          <article class="rounded-lg bg-input p-4">
            <p class="font-body text-xs text-text-muted">
              {{ t('practice-metric-accepted-week') }}
            </p>
            <p class="mt-1 font-heading text-2xl font-bold text-[#2D8A56]">
              {{ data.metrics.accepted_this_week }}
            </p>
          </article>
        </div>

        <div class="grid gap-5 xl:grid-cols-[minmax(280px,0.85fr)_minmax(0,1.4fr)]">
          <div class="flex flex-col gap-4">
            <section class="flex flex-col gap-3 rounded-lg border border-border p-4">
              <h2 class="font-heading text-lg font-bold text-text">{{ t('practice-students') }}</h2>
              @if (!data.students.length) {
                <p class="text-sm text-text-muted">{{ t('practice-no-students') }}</p>
              }
              @for (student of data.students; track student.id) {
                <button
                  type="button"
                  (click)="selectStudent(student.id)"
                  [class]="
                    selectedStudent() === student.id
                      ? 'rounded-md border border-primary bg-[#F0F7EB] p-3 text-left'
                      : 'rounded-md border border-border bg-surface p-3 text-left hover:bg-input'
                  "
                >
                  <span class="flex items-center justify-between gap-3"
                    ><span class="font-body text-sm font-semibold text-text">{{
                      student.name
                    }}</span
                    ><span class="font-body text-xs font-bold text-primary"
                      >{{ student.progress }}%</span
                    ></span
                  >
                  <span class="mt-2 block h-1.5 overflow-hidden rounded-full bg-border"
                    ><span
                      class="block h-full rounded-full bg-primary"
                      [style.width.%]="student.progress"
                    ></span
                  ></span>
                  <span class="mt-2 block font-body text-xs text-text-muted">{{
                    student.login
                  }}</span>
                </button>
              }
            </section>

            @if (selectedStudentData(); as student) {
              <section class="flex flex-col gap-2 rounded-lg border border-border p-4">
                <h2 class="font-heading text-base font-bold text-text">
                  {{ t('practice-chapter-progress', { name: student.name }) }}
                </h2>
                @for (chapter of student.chapters; track chapter.id) {
                  <div class="flex items-center gap-2 border-b border-border py-2 last:border-0">
                    <span class="min-w-0 flex-1 truncate font-body text-xs text-text">{{
                      chapter.title
                    }}</span>
                    <span class="font-body text-xs text-text-muted"
                      >{{ chapter.done }}/{{ chapter.total }}</span
                    >
                    <span class="w-10 text-right font-body text-xs font-semibold text-primary"
                      >{{ chapter.progress }}%</span
                    >
                  </div>
                }
              </section>
            }
          </div>

          <div class="flex flex-col gap-4">
            <section class="flex flex-col gap-3 rounded-lg border border-border p-4">
              <div class="flex items-center justify-between gap-3">
                <h2 class="font-heading text-lg font-bold text-text">{{ t('practice-queue') }}</h2>
                <span
                  class="rounded-full bg-[#FEF3C7] px-2.5 py-1 font-body text-xs font-semibold text-[#B45309]"
                  >{{ data.pending.length }}</span
                >
              </div>
              @if (!data.pending.length) {
                <p class="text-sm text-text-muted">{{ t('practice-queue-empty') }}</p>
              }
              @for (attempt of data.pending; track attempt.id) {
                <article class="flex flex-col gap-3 rounded-md bg-input p-4">
                  <div class="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 class="font-body text-sm font-bold text-text">
                        {{ attempt.lesson_title || attempt.lesson_id }}
                      </h3>
                      <p class="mt-1 font-body text-xs text-text-muted">
                        {{ attempt.student_name }} ·
                        {{ attempt.chapter_title || attempt.chapter_id }} ·
                        {{ t('practice-attempt-number', { number: attempt.attempt_number }) }}
                      </p>
                    </div>
                    <span
                      class="rounded-full bg-[#FEF3C7] px-2.5 py-1 font-body text-[11px] font-semibold text-[#B45309]"
                      >{{ t('practice-status-submitted') }}</span
                    >
                  </div>
                  <a
                    [href]="attempt.repository_url"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="break-all font-body text-sm text-primary underline"
                    >{{ attempt.repository_url }}</a
                  >
                  @if (attempt.message) {
                    <p class="font-body text-sm text-text-secondary">{{ attempt.message }}</p>
                  }
                  @if (attempt.report) {
                    <p class="whitespace-pre-wrap font-body text-sm text-text-secondary">
                      {{ attempt.report }}
                    </p>
                  }
                  <textarea
                    rows="2"
                    [value]="feedback(attempt.id)"
                    (input)="setFeedback(attempt.id, $any($event.target).value)"
                    [placeholder]="t('practice-feedback-placeholder')"
                    class="resize-y rounded-md border border-border bg-surface px-3 py-2 font-body text-sm text-text outline-none focus:border-primary"
                  ></textarea>
                  <div class="flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      [disabled]="!!reviewing()"
                      (click)="review(attempt.id, 'revision_requested')"
                      class="inline-flex items-center gap-1.5 rounded-md border border-[#E8B4B4] px-3 py-2 font-body text-xs font-semibold text-danger disabled:opacity-50"
                    >
                      @if (reviewing() === attempt.id) {
                        <app-spinner extra="h-3.5 w-3.5 animate-spin" />
                      }
                      {{ t('practice-request-revision') }}
                    </button>
                    <button
                      type="button"
                      [disabled]="!!reviewing()"
                      (click)="review(attempt.id, 'accepted')"
                      class="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 font-body text-xs font-semibold text-text-inverse disabled:opacity-50"
                    >
                      @if (reviewing() === attempt.id) {
                        <app-spinner extra="h-3.5 w-3.5 animate-spin" />
                      } @else {
                        <app-icon name="check" extra="h-3.5 w-3.5" />
                      }
                      {{ t('practice-accept') }}
                    </button>
                  </div>
                </article>
              }
            </section>

            <section class="flex flex-col gap-2 rounded-lg border border-border p-4">
              <h2 class="font-heading text-base font-bold text-text">
                {{ t('practice-recent-activity') }}
              </h2>
              @for (item of data.recent; track item.id) {
                <div
                  class="flex flex-wrap items-center justify-between gap-2 border-b border-border py-2 last:border-0"
                >
                  <span class="font-body text-xs text-text"
                    >{{ item.student_name }} · {{ item.lesson_title || item.lesson_id }}</span
                  ><span class="font-body text-xs text-text-muted">{{
                    practiceStatus(item.status)
                  }}</span>
                </div>
              }
              @if (!data.recent.length) {
                <p class="text-sm text-text-muted">{{ t('practice-activity-empty') }}</p>
              }
            </section>
          </div>
        </div>
      }
    </section>
  `,
})
export class PracticesReviewPage {
  private readonly api = inject(ApiService);
  private readonly i18n = inject(I18nService);
  readonly courses = signal<CourseListItem[]>([]);
  readonly selectedCourse = signal('');
  readonly dashboard = signal<PracticeDashboard | null>(null);
  readonly selectedStudent = signal('');
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly reviewing = signal('');
  private feedbackValues: Record<string, string> = {};

  constructor() {
    void this.load();
  }
  t(key: string, args?: Record<string, unknown>): string {
    return this.i18n.format(key, args);
  }
  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const result = await this.api.courses();
      this.courses.set(result.courses);
      const id = this.selectedCourse() || result.courses[0]?.id || '';
      this.selectedCourse.set(id);
      if (id) await this.loadDashboard(id);
      else this.dashboard.set(null);
    } catch {
      this.error.set(this.t('error-generic'));
    } finally {
      this.loading.set(false);
    }
  }
  async selectCourse(id: string): Promise<void> {
    this.selectedCourse.set(id);
    this.selectedStudent.set('');
    await this.loadDashboard(id);
  }
  async loadDashboard(id: string): Promise<void> {
    if (!id) return;
    this.loading.set(true);
    this.error.set(null);
    try {
      this.dashboard.set(await this.api.practiceDashboard(id));
    } catch {
      this.error.set(this.t('error-generic'));
      this.dashboard.set(null);
    } finally {
      this.loading.set(false);
    }
  }
  selectStudent(id: string): void {
    this.selectedStudent.set(id);
  }
  selectedStudentData() {
    return (
      this.dashboard()?.students.find((student) => student.id === this.selectedStudent()) ?? null
    );
  }
  feedback(id: string): string {
    return this.feedbackValues[id] ?? '';
  }
  setFeedback(id: string, value: string): void {
    this.feedbackValues = { ...this.feedbackValues, [id]: value };
  }
  practiceStatus(status: PracticeStatus): string {
    const keys = {
      submitted: 'practice-status-submitted',
      revision_requested: 'practice-status-revision',
      accepted: 'practice-status-accepted',
    };
    return this.t(keys[status]);
  }
  async review(id: string, decision: 'accepted' | 'revision_requested'): Promise<void> {
    this.reviewing.set(id);
    this.error.set(null);
    try {
      await this.api.reviewPractice(id, decision, this.feedback(id));
      await this.loadDashboard(this.selectedCourse());
    } catch {
      this.error.set(this.t('practice-review-error'));
    } finally {
      this.reviewing.set('');
    }
  }
}
