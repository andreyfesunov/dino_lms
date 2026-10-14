import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ApiService } from '../../core/api.service';
import { LessonResponse } from '../../core/api.types';
import { I18nService } from '../../core/i18n.service';
import { Icon } from '../../shared/icon';
import { CallLesson } from '../../shared/call-lesson';
import { CodeBlocks } from '../../shared/code-blocks';

@Component({
  selector: 'app-lesson',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon, CallLesson, RouterLink, CodeBlocks],
  template: `
    @if (error()) {
      <p role="alert" class="rounded-md bg-danger/10 p-4 text-danger">{{ error() }}</p>
    }
    @if (loading()) { <section class="design-page"><p role="status" class="text-sm text-text-muted">{{ t('page-loading') }}</p></section> }
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
          <div
            class="md-body"
            [appCodeBlocks]="l.html"
            [articleTitle]="l.title"
            [innerHTML]="l.html"
          ></div>
        }

        @if (l.videos.length > 0) {
          <div class="flex flex-col gap-3">
            <h2 class="flex items-center gap-2 font-heading text-[17px] font-bold text-text">
              <app-icon name="circle-play" extra="h-[18px] w-[18px] text-primary" />
              {{ t('lesson-video-title') }}
            </h2>
            @for (video of l.videos; track video.file) {
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
            }
          </div>
        }

        @if (l.youtube.length > 0) {
          <div class="flex flex-col gap-3">
            <h2 class="flex items-center gap-2 font-heading text-[17px] font-bold text-text">
              <app-icon name="external-link" extra="h-[18px] w-[18px] text-text-secondary" />
              {{ t('lesson-links-title') }}
            </h2>
            @for (link of l.youtube; track link.url) {
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
                    class="inline-flex items-center gap-1 font-body text-xs font-semibold text-primary"
                  >
                    <app-icon name="external-link" extra="h-3 w-3" />
                    {{ t('lesson-open-link') }}
                  </span>
                </span>
              </a>
            }
          </div>
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
          @if (l.type !== 'call') {
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
              <app-icon name="check-circle" extra="h-4 w-4" />
              {{ done() ? t('lesson-mark-undone') : t('lesson-mark-done') }}
            </button>
          }
        </div>
      </section>
    }
  `,
})
export class LessonPage {
  private api = inject(ApiService);
  private i18n = inject(I18nService);
  private activatedRoute = inject(ActivatedRoute);
  private destroyRef = inject(DestroyRef);

  readonly lesson = signal<LessonResponse | null>(null);
  readonly done = signal(false);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly busy = signal(false);
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
    } catch {
      if (generation === this.loadGeneration) this.error.set(this.t('error-generic'));
    } finally { if (generation === this.loadGeneration) this.loading.set(false); }
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
}
