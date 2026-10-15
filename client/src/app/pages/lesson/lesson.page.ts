import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ApiService } from '../../core/api.service';
import { LessonResponse } from '../../core/api.types';
import { I18nService } from '../../core/i18n.service';
import { Icon } from '../../shared/icon';
import { CallLesson } from '../../shared/call-lesson';
import { CodeBlocks } from '../../shared/code-blocks';
import { FormsModule } from '@angular/forms';
import { PracticeAttempt } from '../../core/api.types';
import { Skeleton, Spinner } from '../../shared/loading';

@Component({
  selector: 'app-lesson',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon, CallLesson, RouterLink, CodeBlocks, FormsModule, Skeleton, Spinner],
  template: `
    @if (error()) {
      <p role="alert" class="rounded-md bg-danger/10 p-4 text-danger">{{ error() }}</p>
    }
    @if (loading()) {
      <section class="design-page lesson-page" role="status" [attr.aria-label]="t('page-loading')">
        <app-skeleton class="h-4 w-36 rounded md:hidden" />
        <div class="flex flex-col gap-3">
          <app-skeleton class="h-8 w-3/4 rounded" /><app-skeleton class="h-4 w-48 rounded" />
        </div>
        <div class="h-px bg-border"></div>
        <div class="flex flex-col gap-4" aria-hidden="true">
          @for (row of [1, 2, 3, 4, 5]; track row) {
            <app-skeleton [class]="row === 1 ? 'h-5 w-2/3 rounded' : 'h-4 w-full rounded'" />
          }
          <app-skeleton class="mt-2 h-40 w-full rounded-lg" />
          <app-skeleton class="h-4 w-5/6 rounded" />
        </div>
        <div class="mt-auto flex justify-end"><app-skeleton class="h-10 w-36 rounded-md" /></div>
      </section>
    }
    @if (lesson(); as l) {
      <section class="design-page lesson-page">
        <div class="lesson-breadcrumb flex items-center justify-between gap-4 md:hidden">
          <a
            [routerLink]="'/courses/' + l.course.id"
            class="inline-flex items-center gap-2 font-body text-[13px] text-text-secondary hover:text-text"
          >
            <app-icon name="arrow-left" extra="h-4 w-4" />
            {{ t('lesson-open-course') }}
          </a>
          @if (done()) {
            <span
              class="inline-flex items-center gap-1.5 rounded-full bg-[#D1FAE5] px-3 py-1 font-body text-[11px] font-semibold text-[#059669]"
            >
              <app-icon name="circle-play" extra="h-3.5 w-3.5" />
              {{ t('lesson-done-badge') }}
            </span>
          }
        </div>

        <div class="flex flex-col gap-2">
          <h1 class="font-heading text-[26px] font-bold text-text">{{ l.title }}</h1>
          <div class="flex flex-wrap items-center gap-3">
            <p class="font-body text-[13px] text-text-muted">{{ meta() }}</p>
            @if (l.type === 'practice') {
              <span
                class="inline-flex items-center gap-1 rounded-full bg-[#FEF3C7] px-2.5 py-1 font-body text-[11px] font-semibold text-[#B45309]"
                ><app-icon name="briefcase-business" extra="h-3 w-3" />{{
                  t('practice-type-label')
                }}</span
              >
            }
            @if (done()) {
              <span
                class="hidden items-center gap-1.5 rounded-full bg-[#D1FAE5] px-3 py-1 text-[11px] text-[#059669] md:inline-flex"
                ><app-icon name="check-circle" extra="h-3.5 w-3.5" />{{
                  t('lesson-done-badge')
                }}</span
              >
            }
          </div>
        </div>

        <div class="h-px bg-border"></div>

        @if (l.type === 'call') {
          <app-call-lesson
            [key]="{ course_id: l.course.id, chapter_id: l.chapter.id, lesson_id: l.id }"
          />
        } @else {
          @for (block of contentBlocks(l); track $index) {
            @if (block.type === 'html') {
              <div
                class="md-body"
                [appCodeBlocks]="block.html || ''"
                [articleTitle]="l.title"
                [innerHTML]="block.html || ''"
              ></div>
            }

            @if (block.type === 'video') {
              @let video = l.videos[block.index];
              <div class="flex flex-col gap-3">
                <figure class="flex flex-col gap-2">
                  <video
                    [src]="video.url"
                    controls
                    preload="metadata"
                    class="aspect-video w-full rounded-lg bg-black"
                  ></video>
                  <figcaption class="font-body text-sm font-semibold text-text">
                    {{ l.title }} — {{ video.file }}
                  </figcaption>
                </figure>
              </div>
            }

            @if (block.type === 'youtube') {
              @let link = l.youtube[block.index];
              <div class="flex flex-col gap-3">
                <a
                  [href]="link.url"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="group flex items-stretch gap-4 rounded-lg border border-border bg-surface p-3 transition-colors hover:border-primary/40"
                >
                  <span
                    class="relative block h-[60px] w-[100px] sm:h-[84px] sm:w-[150px] shrink-0 overflow-hidden rounded-md bg-input"
                  >
                    @if (link.thumbnail) {
                      <img
                        [src]="link.thumbnail"
                        alt=""
                        loading="lazy"
                        class="h-full w-full object-cover transition-transform group-hover:scale-105"
                      />
                    }
                    <span class="absolute inset-0 flex items-center justify-center">
                      <span
                        class="flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white"
                      >
                        <app-icon name="play" extra="h-4 w-4" />
                      </span>
                    </span>
                  </span>
                  <span class="flex min-w-0 flex-1 flex-col justify-center gap-1">
                    <span
                      class="truncate font-body text-sm font-semibold text-text group-hover:text-primary"
                    >
                      {{ link.title }}
                    </span>
                    <span class="font-body text-xs text-text-muted">
                      {{ t('lesson-source-youtube') }}
                    </span>
                    @if (link.channel) {
                      <span class="font-body text-xs text-text-muted">{{ link.channel }}</span>
                    }
                    <span
                      class="inline-flex items-center gap-1 font-body text-xs font-semibold leading-none text-primary"
                    >
                      <app-icon name="external-link" extra="h-3 w-3" />
                      {{ t('lesson-open-link') }}
                    </span>
                  </span>
                </a>
              </div>
            }
          }
        }

        @if (l.attachments?.length) {
          <section class="flex flex-col gap-3">
            <h2 class="flex items-center gap-2 font-heading text-[17px] font-bold text-text">
              <app-icon name="paperclip" extra="h-[18px] w-[18px] text-text-secondary" />
              {{ t('practice-materials') }}
            </h2>
            @for (file of l.attachments; track file.file) {
              <a
                [href]="file.url"
                [download]="file.file"
                class="flex items-center gap-3 rounded-lg border border-border bg-input p-3 hover:border-primary/40"
              >
                <app-icon name="file-text" extra="h-5 w-5 text-primary" />
                <span class="min-w-0 flex-1 truncate font-body text-sm font-semibold text-text">{{
                  file.file
                }}</span>
                <app-icon name="download" extra="h-4 w-4 text-text-secondary" />
              </a>
            }
          </section>
        }

        @if (l.type === 'practice') {
          <section
            class="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4 sm:p-5"
          >
            <div class="flex flex-wrap items-center justify-between gap-3">
              <h2 class="font-heading text-lg font-bold text-text">
                {{ t('practice-submit-title') }}
              </h2>
              <span
                class="rounded-full bg-input px-3 py-1 font-body text-xs font-semibold text-text-secondary"
              >
                {{
                  practiceAttempts().length
                    ? practiceStatus(practiceAttempts()[0].status)
                    : t('practice-not-submitted')
                }}
              </span>
            </div>

            @if (practiceError()) {
              <p role="alert" class="rounded-md bg-danger/10 p-3 text-sm text-danger">
                {{ practiceError() }}
              </p>
            }

            @if (practiceCanSubmit()) {
              <form class="flex flex-col gap-3" (ngSubmit)="submitPractice()">
                <label class="flex flex-col gap-1.5 font-body text-sm font-semibold text-text">
                  {{ t('practice-repository') }}
                  <input
                    name="repository"
                    type="url"
                    required
                    [(ngModel)]="repositoryUrl"
                    [placeholder]="t('practice-repository-placeholder')"
                    class="rounded-md border border-border bg-input px-3 py-2.5 font-normal text-text outline-none focus:border-primary"
                  />
                </label>
                <label class="flex flex-col gap-1.5 font-body text-sm font-semibold text-text">
                  {{ t('practice-message') }}
                  <input
                    name="message"
                    type="text"
                    [(ngModel)]="studentMessage"
                    [placeholder]="t('practice-message-placeholder')"
                    class="rounded-md border border-border bg-input px-3 py-2.5 font-normal text-text outline-none focus:border-primary"
                  />
                </label>
                <label class="flex flex-col gap-1.5 font-body text-sm font-semibold text-text">
                  {{ t('practice-report') }}
                  <textarea
                    name="report"
                    rows="3"
                    [(ngModel)]="studentReport"
                    [placeholder]="t('practice-report-placeholder')"
                    class="resize-y rounded-md border border-border bg-input px-3 py-2.5 font-normal text-text outline-none focus:border-primary"
                  ></textarea>
                </label>
                <div class="flex justify-end">
                  <button
                    type="submit"
                    [disabled]="practiceSubmitting()"
                    class="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 font-body text-sm font-semibold text-text-inverse disabled:opacity-60"
                  >
                    @if (practiceSubmitting()) {
                      <app-spinner />
                    } @else {
                      <app-icon name="send" extra="h-4 w-4" />
                    }
                    {{ practiceSubmitting() ? t('practice-submitting') : t('practice-submit') }}
                  </button>
                </div>
              </form>
            } @else if (!practiceAttempts().length) {
              <p class="font-body text-sm text-text-muted">{{ t('practice-load-empty') }}</p>
            }

            @if (practiceAttempts().length) {
              <div class="flex flex-col gap-3 border-t border-border pt-4">
                <h3 class="font-heading text-base font-bold text-text">
                  {{ t('practice-attempt-history') }}
                </h3>
                @for (attempt of practiceAttempts(); track attempt.id) {
                  <article class="flex flex-col gap-2 rounded-md bg-input p-3 sm:p-4">
                    <div class="flex flex-wrap items-center justify-between gap-2">
                      <span class="font-body text-sm font-semibold text-text">{{
                        t('practice-attempt-number', { number: attempt.attempt_number })
                      }}</span>
                      <span
                        class="rounded-full bg-surface px-2.5 py-1 font-body text-xs font-semibold text-text-secondary"
                        >{{ practiceStatus(attempt.status) }}</span
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
                    @if (attempt.feedback) {
                      <div class="rounded-md border border-[#F3C978] bg-[#FFF8EC] p-3">
                        <p class="font-body text-xs font-bold text-text">
                          {{
                            t('practice-teacher-feedback', {
                              name: attempt.reviewer_name || t('role-teacher'),
                            })
                          }}
                        </p>
                        <p class="mt-1 whitespace-pre-wrap font-body text-sm text-text-secondary">
                          {{ attempt.feedback }}
                        </p>
                      </div>
                    }
                  </article>
                }
              </div>
            }
          </section>
        }

        <div class="h-px bg-border"></div>

        <div class="lesson-actions flex flex-wrap items-center justify-between gap-3">
          <div class="flex flex-wrap items-center gap-2">
            @if (l.prev; as prev) {
              <a
                [routerLink]="lessonHref(prev.chapter_id, prev.lesson_id)"
                class="inline-flex items-center gap-2 rounded-md border border-border px-3.5 py-2 font-body text-[13px] font-medium text-text-secondary hover:bg-input"
              >
                <app-icon name="arrow-left" extra="h-3.5 w-3.5" />
                {{ t('lesson-prev') }}
                <span class="hidden max-w-[180px] truncate sm:inline">— {{ prev.title }}</span>
              </a>
            }
            @if (l.next; as next) {
              <a
                [routerLink]="lessonHref(next.chapter_id, next.lesson_id)"
                class="inline-flex items-center gap-2 rounded-md bg-primary px-3.5 py-2 font-body text-[13px] font-semibold text-text-inverse hover:bg-inverse"
              >
                {{ t('lesson-next') }}
                <span class="hidden max-w-[180px] truncate sm:inline">— {{ next.title }}</span>
                <app-icon name="arrow-right" extra="h-3.5 w-3.5" />
              </a>
            }
          </div>
          @if (l.type === 'article') {
            <button
              type="button"
              [disabled]="busy()"
              (click)="toggleDone()"
              [class]="
                done()
                  ? 'inline-flex items-center gap-2 rounded-md border border-border bg-input px-3.5 py-2 font-body text-[13px] font-medium text-text-secondary hover:bg-border'
                  : 'inline-flex items-center gap-2 rounded-md bg-primary px-3.5 py-2 font-body text-[13px] font-semibold text-text-inverse hover:bg-inverse'
              "
            >
              @if (busy()) {
                <app-spinner />
              } @else {
                <app-icon name="check-circle" extra="h-4 w-4" />
              }
              {{ done() ? t('lesson-mark-undone') : t('lesson-mark-done') }}
            </button>
          }
        </div>
      </section>
    }
  `,
})
export class LessonPage {
  contentBlocks(lesson: LessonResponse) {
    return (
      lesson.blocks ?? [
        { type: 'html', html: lesson.html, index: 0 },
        ...lesson.videos.map((_, index) => ({ type: 'video', html: '', index })),
        ...lesson.youtube.map((_, index) => ({ type: 'youtube', html: '', index })),
      ]
    );
  }
  private api = inject(ApiService);
  private i18n = inject(I18nService);
  private activatedRoute = inject(ActivatedRoute);
  private destroyRef = inject(DestroyRef);

  readonly lesson = signal<LessonResponse | null>(null);
  readonly done = signal(false);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly busy = signal(false);
  readonly practiceAttempts = signal<PracticeAttempt[]>([]);
  readonly practiceCanSubmit = signal(false);
  readonly practiceSubmitting = signal(false);
  readonly practiceError = signal<string | null>(null);
  repositoryUrl = '';
  studentMessage = '';
  studentReport = '';
  private routeIds = { course: '', chapter: '', lesson: '' };
  private loadGeneration = 0;

  t(key: string, args?: Record<string, unknown>): string {
    return this.i18n.format(key, args);
  }

  ngOnInit(): void {
    this.activatedRoute.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      this.routeIds = {
        course: params.get('courseId') ?? '',
        chapter: params.get('chapterId') ?? '',
        lesson: params.get('lessonId') ?? '',
      };
      void this.loadLesson();
    });
  }

  private async loadLesson(): Promise<void> {
    const generation = ++this.loadGeneration;
    this.loading.set(true);
    this.lesson.set(null);
    this.done.set(false);
    try {
      this.error.set(null);
      const lesson = await this.api.lesson(
        this.routeIds.course,
        this.routeIds.chapter,
        this.routeIds.lesson,
      );
      if (generation !== this.loadGeneration) return;
      this.lesson.set(lesson);
      this.done.set(lesson.done);
      if (lesson.type === 'practice') {
        const result = await this.api.practiceAttempts(
          lesson.course.id,
          lesson.chapter.id,
          lesson.id,
        );
        if (generation !== this.loadGeneration) return;
        this.practiceAttempts.set(result.attempts);
        this.practiceCanSubmit.set(result.can_submit);
      } else {
        this.practiceAttempts.set([]);
      }
    } catch {
      if (generation === this.loadGeneration) this.error.set(this.t('error-generic'));
    } finally {
      if (generation === this.loadGeneration) this.loading.set(false);
    }
  }

  meta(): string {
    const l = this.lesson();
    if (!l) {
      return '';
    }
    const current = l.chapter_lesson_index;
    if (l.durationMin != null) {
      return this.t('lesson-meta', {
        chapter: l.chapter_index,
        current,
        total: l.chapter_total_lessons,
        minutes: l.durationMin,
      });
    }
    return this.t('lesson-meta-simple', {
      chapter: l.chapter_index,
      current,
      total: l.chapter_total_lessons,
    });
  }

  lessonHref(chapterId: string, lessonId: string): string {
    return `/courses/${this.routeIds.course}/${chapterId}/${lessonId}`;
  }

  async toggleDone(): Promise<void> {
    if (this.busy()) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    const next = !this.done();
    try {
      const result = await this.api.progress(
        this.routeIds.course,
        this.routeIds.chapter,
        this.routeIds.lesson,
        next,
      );
      this.done.set(result.done);
    } catch {
      this.error.set(this.t('error-generic'));
    } finally {
      this.busy.set(false);
    }
  }

  practiceStatus(status: PracticeAttempt['status']): string {
    const keys = {
      submitted: 'practice-status-submitted',
      revision_requested: 'practice-status-revision',
      accepted: 'practice-status-accepted',
    };
    return this.t(keys[status]);
  }

  async submitPractice(): Promise<void> {
    const lesson = this.lesson();
    if (!lesson || this.practiceSubmitting() || !this.repositoryUrl.trim()) return;
    this.practiceSubmitting.set(true);
    this.practiceError.set(null);
    try {
      await this.api.submitPractice(lesson.course.id, lesson.chapter.id, lesson.id, {
        repository_url: this.repositoryUrl.trim(),
        report: this.studentReport.trim(),
        message: this.studentMessage.trim(),
      });
      const result = await this.api.practiceAttempts(
        lesson.course.id,
        lesson.chapter.id,
        lesson.id,
      );
      this.practiceAttempts.set(result.attempts);
      this.practiceCanSubmit.set(result.can_submit);
      this.repositoryUrl = '';
      this.studentMessage = '';
      this.studentReport = '';
    } catch {
      this.practiceError.set(this.t('practice-submit-error'));
    } finally {
      this.practiceSubmitting.set(false);
    }
  }
}
