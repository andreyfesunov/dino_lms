import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ApiService } from '../../core/api.service';
import { LessonResponse } from '../../core/api.types';
import { I18nService } from '../../core/i18n.service';
import { Icon } from '../../shared/icon';
import { CallLesson } from '../../shared/call-lesson';

@Component({
  selector: 'app-lesson',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon, CallLesson],
  template: `
    @if (error()) {
      <p role="alert" class="rounded-md bg-danger/10 p-4 text-danger">{{ error() }}</p>
    }
    @if (lesson(); as l) {
      <section
        class="flex h-full min-h-[calc(100vh-2rem)] flex-col gap-5 rounded-xl bg-surface p-5 shadow-[0_4px_24px_rgba(27,58,40,0.06)] md:p-8"
      >
        <div class="flex items-center justify-between gap-4">
          <a
            [href]="'/courses/' + l.course.id"
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
          <h1 class="font-heading text-[26px] font-semibold text-text">{{ l.title }}</h1>
          <p class="font-body text-[13px] text-text-muted">{{ meta() }}</p>
        </div>

        <div class="h-px bg-border"></div>

        @if (l.type === 'call') {
          <app-call-lesson
            [key]="{ course_id: l.course.id, chapter_id: l.chapter.id, lesson_id: l.id }"
          />
        } @else {
          <div class="md-body flex flex-col" [innerHTML]="l.html"></div>
        }

        @if (l.videos.length > 0) {
          <div class="flex flex-col gap-3">
            <h2 class="flex items-center gap-2 font-heading text-[17px] font-semibold text-text">
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
            <h2 class="flex items-center gap-2 font-heading text-[17px] font-semibold text-text">
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
                  class="relative block h-[84px] w-[150px] shrink-0 overflow-hidden rounded-md bg-input"
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

        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex flex-wrap items-center gap-2">
            @if (l.prev; as prev) {
              <a
                [href]="lessonHref(prev.chapter_id, prev.lesson_id)"
                class="inline-flex items-center gap-2 rounded-md border border-border px-3.5 py-2 font-body text-[13px] font-medium text-text-secondary hover:bg-input"
              >
                <app-icon name="arrow-left" extra="h-3.5 w-3.5" />
                {{ t('lesson-prev') }}
                <span class="hidden max-w-[180px] truncate sm:inline">— {{ prev.title }}</span>
              </a>
            }
            @if (l.next; as next) {
              <a
                [href]="lessonHref(next.chapter_id, next.lesson_id)"
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

  readonly lesson = signal<LessonResponse | null>(null);
  readonly done = signal(false);
  readonly error = signal<string | null>(null);
  readonly busy = signal(false);
  private route = { course: '', chapter: '', lesson: '' };

  t(key: string, args?: Record<string, unknown>): string {
    return this.i18n.format(key, args);
  }

  async ngOnInit(): Promise<void> {
    try {
      const parts = location.pathname.split('/').filter(Boolean);
      this.route = {
        course: parts[1] ?? '',
        chapter: parts[2] ?? '',
        lesson: parts[3] ?? '',
      };
      const lesson = await this.api.lesson(
        this.route.course,
        this.route.chapter,
        this.route.lesson,
      );
      this.lesson.set(lesson);
      this.done.set(lesson.done);
    } catch {
      this.error.set(this.t('error-generic'));
    }
  }

  meta(): string {
    const l = this.lesson();
    if (!l) {
      return '';
    }
    const current = l.index + 1;
    if (l.durationMin != null) {
      return this.t('lesson-meta', {
        chapter: l.chapter.title,
        current,
        total: l.total,
        minutes: l.durationMin,
      });
    }
    return this.t('lesson-meta-simple', {
      chapter: l.chapter.title,
      current,
      total: l.total,
    });
  }

  lessonHref(chapterId: string, lessonId: string): string {
    return `/courses/${this.route.course}/${chapterId}/${lessonId}`;
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
        this.route.course,
        this.route.chapter,
        this.route.lesson,
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
