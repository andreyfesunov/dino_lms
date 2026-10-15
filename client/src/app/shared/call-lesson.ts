import { Component, inject, input, signal, OnInit, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, ApiError } from '../core/api.service';
import { CallKey, CallSettings, CallBooking } from '../core/api.types';
import { SessionStore } from '../core/session.store';
import { I18nService } from '../core/i18n.service';
import { CallSlots } from './call-slots';
import { CallCard } from './call-card';
import { Spinner } from './loading';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-call-lesson',
  imports: [FormsModule, CallSlots, CallCard, Spinner, RouterLink],
  template: `
    <div class="flex flex-col gap-5">
      @if (error()) {
        <p role="alert" class="text-danger">{{ error() }}</p>
      }
      @if (!settings() && !error()) {
        <p role="status" class="flex items-center gap-2 text-sm text-text-muted">
          <app-spinner />{{ t('calls-loading') }}
        </p>
      }
      @if (busy()) {
        <p role="status" class="flex items-center gap-2 text-sm text-text-muted">
          <app-spinner />{{ t('calls-loading') }}
        </p>
      }
      @if (settings(); as cfg) {
        <p class="text-sm text-text-muted">
          {{ cfg.teacher_name || t('calls-no-teacher') }} · {{ cfg.duration_min }}
          {{ t('calls-minutes') }}
        </p>
        @if (cfg.can_manage) {
          <a routerLink="/calls/schedule" class="w-fit rounded-md bg-primary-soft px-4 py-2 text-primary">
            {{ t('calls-open-schedule') }}
          </a>
        }
        @if (session.isAdmin() || cfg.can_manage) {
          <details
            class="rounded-lg border border-border bg-surface p-4"
            [open]="expanded()"
            (toggle)="expanded.set($any($event.target).open)"
          >
            <summary class="cursor-pointer font-semibold">{{ t('calls-settings') }}</summary>
            <div class="mt-4 flex flex-col gap-4">
              @if (session.isAdmin()) {
                <label class="flex flex-col gap-1"
                  >{{ t('calls-teacher') }}
                  <select
                    class="min-w-0 w-full rounded-md border border-border bg-input p-3"
                    [(ngModel)]="cfg.teacher_id"
                    [attr.aria-label]="t('calls-teacher')"
                    (ngModelChange)="saved.set(false)"
                  >
                    <option value="">{{ t('calls-no-teacher') }}</option>
                    @for (teacher of teachers(); track teacher.id) {
                      <option [value]="teacher.id">{{ teacher.name }}</option>
                    }
                  </select>
                </label>
              }
              <div class="grid gap-3 sm:grid-cols-2">
                <label class="flex flex-col gap-1"
                  >{{ t('calls-duration')
                  }}<input
                    type="number"
                    min="5"
                    max="480"
                    class="min-w-0 w-full rounded-md border border-border bg-input p-3"
                    [(ngModel)]="cfg.duration_min"
                    (ngModelChange)="saved.set(false)"
                /></label>
              </div>
              <p class="text-sm text-text-muted">{{ t('calls-duration-help') }}</p>
              <button
                type="button"
                class="inline-flex w-fit items-center gap-2 rounded-md bg-primary px-4 py-2 text-text-inverse disabled:opacity-50"
                [disabled]="busy()"
                (click)="save()"
              >
                @if (busy()) {
                  <app-spinner />
                }
                {{ t('calls-save') }}
              </button>
              @if (saved()) {
                <p role="status" class="text-primary">{{ t('calls-saved') }}</p>
              }
            </div>
          </details>
        }
        @for (call of bookings(); track call.id) {
          <app-call-card [call]="call" (changed)="load()" />
        }
        @if (session.user()?.role === 'student' && !hasBooking()) {
          @if (cfg.teacher_id) {
            <app-call-slots [key]="key()" [disabled]="busy()" (chosen)="book($event)" />
          }
        }
      }
    </div>
  `,
})
export class CallLesson implements OnInit {
  readonly key = input.required<CallKey>();
  readonly session = inject(SessionStore);
  private api = inject(ApiService);
  private i18n = inject(I18nService);
  readonly slots = viewChild(CallSlots);
  readonly settings = signal<CallSettings | null>(null);
  readonly expanded = signal(false);
  readonly bookings = signal<CallBooking[]>([]);
  readonly teachers = signal<{ id: string; name: string }[]>([]);
  readonly error = signal('');
  readonly busy = signal(false);
  readonly saved = signal(false);
  t(key: string) {
    return this.i18n.format(key);
  }
  hasBooking() {
    return this.bookings().some((c) => c.status !== 'cancelled');
  }
  ngOnInit() {
    void this.load();
  }
  async load() {
    try {
      const [cfg, result] = await Promise.all([
        this.api.callSettings(this.key()),
        this.api.calls(),
      ]);
      if (!this.settings()) this.expanded.set(!cfg.teacher_id);
      this.settings.set(cfg);
      this.bookings.set(
        result.calls.filter(
          (c) =>
            c.course_id === this.key().course_id &&
            c.chapter_id === this.key().chapter_id &&
            c.lesson_id === this.key().lesson_id,
        ),
      );
      if (this.session.isAdmin()) this.teachers.set((await this.api.callTeachers()).teachers);
    } catch {
      this.error.set(this.t('error-generic'));
    }
  }
  async save() {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.saved.set(false);
    try {
      this.settings.set(await this.api.saveCallSettings(this.key(), this.settings()!));
      this.saved.set(true);
    } catch (e) {
      this.error.set(
        this.t(
          e instanceof ApiError && e.code === 'calls_teacher_busy'
            ? 'calls-teacher-busy'
            : e instanceof ApiError && e.status === 409
              ? 'calls-settings-conflict'
              : e instanceof ApiError && e.code === 'bad_request'
                ? 'calls-invalid'
                : 'error-generic',
        ),
      );
    } finally {
      this.busy.set(false);
    }
  }
  async book(start: number) {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.api.bookCall(this.key(), start);
      await this.load();
    } catch (e) {
      this.error.set(
        this.t(e instanceof ApiError && e.status === 409 ? 'calls-conflict' : 'error-generic'),
      );
      await this.slots()?.load();
    } finally {
      this.busy.set(false);
    }
  }
}
