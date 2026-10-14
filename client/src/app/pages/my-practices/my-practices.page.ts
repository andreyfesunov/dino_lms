import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { PracticeAttempt, PracticeStatus } from '../../core/api.types';
import { I18nService } from '../../core/i18n.service';
import { Icon } from '../../shared/icon';

interface PracticeWork {
  key: string;
  courseId: string;
  chapterId: string;
  lessonId: string;
  courseTitle: string;
  chapterTitle: string;
  lessonTitle: string;
  attempts: PracticeAttempt[];
}

@Component({
  selector: 'app-my-practices-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Icon],
  template: `
    <section class="design-page flex flex-col gap-5">
      <header class="flex flex-col gap-1">
        <h1 class="font-heading text-2xl font-bold text-text sm:text-[28px]">{{ t('my-practices-title') }}</h1>
        <p class="font-body text-sm text-text-muted">{{ t('my-practices-subtitle') }}</p>
      </header>
      @if (error()) { <p role="alert" class="rounded-md bg-danger/10 p-3 text-sm text-danger">{{ error() }}</p> }
      @if (loading()) { <p role="status" class="text-sm text-text-muted">{{ t('page-loading') }}</p> }
      @if (!loading() && !works().length) {
        <section class="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-5 py-12 text-center">
          <app-icon name="briefcase-business" extra="h-8 w-8 text-text-muted" />
          <p class="font-heading text-lg font-bold text-text">{{ t('my-practices-empty') }}</p>
          <p class="max-w-lg font-body text-sm text-text-muted">{{ t('my-practices-empty-hint') }}</p>
          <a routerLink="/courses" class="mt-2 rounded-md bg-primary px-4 py-2 font-body text-sm font-semibold text-text-inverse">{{ t('nav-courses') }}</a>
        </section>
      }
      @for (work of works(); track work.key) {
        <article class="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4 sm:p-5">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="font-body text-xs text-text-muted">{{ work.courseTitle }} · {{ work.chapterTitle }}</p>
              <h2 class="mt-1 font-heading text-lg font-bold text-text">{{ work.lessonTitle }}</h2>
            </div>
            <span [class]="statusClass(work.attempts[0].status)">{{ statusLabel(work.attempts[0].status) }}</span>
          </div>
          @if (work.attempts[0].feedback) {
            <div class="flex gap-3 rounded-md border border-[#F3C978] bg-[#FFF8EC] p-3 sm:p-4">
              <app-icon name="message-square-text" extra="h-5 w-5 shrink-0 text-[#B45309]" />
              <div><p class="font-body text-xs font-bold text-text">{{ t('practice-teacher-feedback', { name: work.attempts[0].reviewer_name || t('role-teacher') }) }}</p><p class="mt-1 whitespace-pre-wrap font-body text-sm text-text-secondary">{{ work.attempts[0].feedback }}</p></div>
            </div>
          }
          <div class="flex flex-wrap items-center justify-between gap-3">
            <span class="font-body text-xs text-text-muted">{{ t('practice-attempt-count', { count: work.attempts.length }) }}</span>
            <a [routerLink]="lessonHref(work)" class="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 font-body text-xs font-semibold text-text-secondary hover:bg-input">
              {{ work.attempts[0].status === 'revision_requested' ? t('practice-rework') : t('practice-open-work') }}
              <app-icon name="arrow-right" extra="h-3.5 w-3.5" />
            </a>
          </div>
          <details class="border-t border-border pt-3">
            <summary class="cursor-pointer font-body text-sm font-semibold text-text-secondary">{{ t('practice-attempt-history') }}</summary>
            <div class="mt-3 flex flex-col gap-3">
              @for (attempt of work.attempts; track attempt.id) {
                <div class="flex flex-col gap-2 rounded-md bg-input p-3">
                  <div class="flex flex-wrap items-center justify-between gap-2"><span class="font-body text-xs font-semibold text-text">{{ t('practice-attempt-number', { number: attempt.attempt_number }) }} · {{ dateLabel(attempt.submitted_at) }}</span><span class="font-body text-xs font-semibold text-text-secondary">{{ statusLabel(attempt.status) }}</span></div>
                  <a [href]="attempt.repository_url" target="_blank" rel="noopener noreferrer" class="break-all font-body text-sm text-primary underline">{{ attempt.repository_url }}</a>
                  @if (attempt.report) { <p class="whitespace-pre-wrap font-body text-sm text-text-secondary">{{ attempt.report }}</p> }
                  @if (attempt.message) { <p class="font-body text-sm text-text-secondary">{{ attempt.message }}</p> }
                  @if (attempt.feedback) { <p class="whitespace-pre-wrap border-l-2 border-[#D97706] pl-3 font-body text-sm text-text-secondary">{{ attempt.feedback }}</p> }
                </div>
              }
            </div>
          </details>
        </article>
      }
    </section>
  `,
})
export class MyPracticesPage {
  private readonly api = inject(ApiService);
  private readonly i18n = inject(I18nService);
  readonly attempts = signal<PracticeAttempt[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  constructor() { void this.load(); }
  t(key: string, args?: Record<string, unknown>): string { return this.i18n.format(key, args); }
  async load(): Promise<void> {
    this.loading.set(true); this.error.set(null);
    try { this.attempts.set((await this.api.myPractices()).attempts); }
    catch { this.error.set(this.t('error-generic')); }
    finally { this.loading.set(false); }
  }
  works(): PracticeWork[] {
    const groups = new Map<string, PracticeWork>();
    for (const attempt of this.attempts()) {
      const key = `${attempt.course_id}/${attempt.chapter_id}/${attempt.lesson_id}`;
      const work = groups.get(key) ?? {
        key, courseId: attempt.course_id, chapterId: attempt.chapter_id, lessonId: attempt.lesson_id,
        courseTitle: attempt.course_title || attempt.course_id, chapterTitle: attempt.chapter_title || attempt.chapter_id,
        lessonTitle: attempt.lesson_title || attempt.lesson_id, attempts: [],
      };
      work.attempts.push(attempt);
      groups.set(key, work);
    }
    return [...groups.values()];
  }
  lessonHref(work: PracticeWork): string { return `/courses/${work.courseId}/${work.chapterId}/${work.lessonId}`; }
  statusLabel(status: PracticeStatus): string {
    const keys = { submitted: 'practice-status-submitted', revision_requested: 'practice-status-revision', accepted: 'practice-status-accepted' };
    return this.t(keys[status]);
  }
  statusClass(status: PracticeStatus): string {
    if (status === 'accepted') return 'rounded-full bg-[#D1FAE5] px-3 py-1 font-body text-xs font-semibold text-[#047857]';
    if (status === 'revision_requested') return 'rounded-full bg-[#FDE8E8] px-3 py-1 font-body text-xs font-semibold text-danger';
    return 'rounded-full bg-[#FEF3C7] px-3 py-1 font-body text-xs font-semibold text-[#B45309]';
  }
  dateLabel(timestamp: number): string { return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(timestamp * 1000)); }
}
