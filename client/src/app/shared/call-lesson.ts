import { Component, inject, input, signal, OnInit, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, ApiError } from '../core/api.service';
import { CallKey, CallSettings, CallBooking } from '../core/api.types';
import { SessionStore } from '../core/session.store';
import { I18nService } from '../core/i18n.service';
import { CallSlots } from './call-slots';
import { CallCard } from './call-card';
import { localCallInput, localCallTime } from './call-time';

@Component({
  selector: 'app-call-lesson',
  imports: [FormsModule, CallSlots, CallCard],
  template: `
    <div class="flex flex-col gap-5">
      @if (error()) {
        <p role="alert" class="text-danger">{{ error() }}</p>
      }
      @if (settings(); as cfg) {
        <p class="text-sm text-text-muted">
          {{ cfg.teacher_name || t('calls-no-teacher') }} · {{ cfg.duration_min }}
          {{ t('calls-minutes') }}
        </p>
        @if (session.isAdmin() || cfg.can_manage) {
          <details
            class="rounded-lg border border-border p-4"
            [open]="expanded()"
            (toggle)="expanded.set($any($event.target).open)"
          >
            <summary class="cursor-pointer font-semibold">{{ t('calls-settings') }}</summary>
            <div class="mt-4 flex flex-col gap-4">
              @if (session.isAdmin()) {
                <label class="flex flex-col gap-1"
                  >{{ t('calls-teacher') }}
                  <select
                    class="rounded-md bg-input p-3"
                    [(ngModel)]="cfg.teacher_id"
                    [attr.aria-label]="t('calls-teacher')"
                    (ngModelChange)="cfg.windows = []; saved.set(false)"
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
                    class="rounded-md bg-input p-3"
                    [(ngModel)]="cfg.duration_min"
                    (ngModelChange)="saved.set(false)"
                /></label>
                <label class="flex flex-col gap-1"
                  >{{ t('calls-timezone')
                  }}<select
                    class="rounded-md bg-input p-3"
                    [attr.aria-label]="t('calls-timezone')"
                    [(ngModel)]="cfg.timezone"
                    (ngModelChange)="saved.set(false)"
                  >
                    @for (zone of zones; track zone) {
                      <option [value]="zone">{{ zone }}</option>
                    }
                  </select></label
                >
              </div>
              <p class="text-sm text-text-muted">{{ t('calls-window-help') }}</p>
              @for (window of cfg.windows; track $index; let i = $index) {
                <div class="flex flex-wrap items-end gap-3 rounded-md bg-input p-3">
                  <label class="flex min-w-0 flex-1 flex-col gap-1 text-sm"
                    >{{ t('calls-start')
                    }}<input
                      type="datetime-local"
                      [ngModel]="local(window.starts_at, cfg.timezone)"
                      (ngModelChange)="editWindow(i, 'starts_at', $event)"
                  /></label>
                  <label class="flex min-w-0 flex-1 flex-col gap-1 text-sm"
                    >{{ t('calls-end')
                    }}<input
                      type="datetime-local"
                      [ngModel]="local(window.ends_at, cfg.timezone)"
                      (ngModelChange)="editWindow(i, 'ends_at', $event)"
                  /></label>
                  <button
                    type="button"
                    class="text-sm text-danger underline"
                    (click)="cfg.windows.splice(i, 1)"
                  >
                    {{ t('calls-remove-window') }}
                  </button>
                </div>
              }
              @if (cfg.teacher_id) {
                <div class="grid gap-3 sm:grid-cols-2">
                  <label class="flex flex-col gap-1 text-sm"
                    >{{ t('calls-start')
                    }}<input
                      type="datetime-local"
                      class="rounded-md bg-input p-3"
                      [(ngModel)]="windowStart"
                  /></label>
                  <label class="flex flex-col gap-1 text-sm"
                    >{{ t('calls-end')
                    }}<input
                      type="datetime-local"
                      class="rounded-md bg-input p-3"
                      [(ngModel)]="windowEnd"
                  /></label>
                </div>
                <button
                  type="button"
                  class="w-fit rounded-md border border-border px-3 py-2"
                  (click)="addWindow()"
                >
                  {{ t('calls-add-window') }}
                </button>
              }
              <button
                type="button"
                class="w-fit rounded-md bg-primary px-4 py-2 text-text-inverse disabled:opacity-50"
                [disabled]="busy()"
                (click)="save()"
              >
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
  readonly zones = Array.from(
    new Set([
      Intl.DateTimeFormat().resolvedOptions().timeZone,
      'UTC',
      ...Intl.supportedValuesOf('timeZone'),
    ]),
  );
  windowStart = '';
  windowEnd = '';
  t(key: string) {
    return this.i18n.format(key);
  }
  local(epoch: number, zone: string) {
    return localCallInput(epoch, zone);
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
      if (cfg.version === 0) cfg.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
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
  editWindow(i: number, field: 'starts_at' | 'ends_at', value: string) {
    try {
      const cfg = this.settings()!;
      cfg.windows[i][field] = localCallTime(value, cfg.timezone);
      this.saved.set(false);
      this.error.set('');
    } catch {
      this.error.set(this.t('calls-invalid-time'));
    }
  }
  addWindow() {
    try {
      const cfg = this.settings()!;
      const start = localCallTime(this.windowStart, cfg.timezone);
      const end = localCallTime(this.windowEnd, cfg.timezone);
      if (start <= Date.now() / 1000 || end <= start) throw new Error();
      cfg.windows.push({ id: '', starts_at: start, ends_at: end });
      this.windowStart = '';
      this.windowEnd = '';
      this.saved.set(false);
      this.error.set('');
    } catch {
      this.error.set(this.t('calls-invalid-time'));
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
