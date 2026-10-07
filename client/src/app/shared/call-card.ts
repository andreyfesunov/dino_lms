import { Component, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, ApiError } from '../core/api.service';
import { CallBooking } from '../core/api.types';
import { SessionStore } from '../core/session.store';
import { I18nService } from '../core/i18n.service';
import { CallSlots } from './call-slots';
import { localCallInput, localCallTime } from './call-time';

@Component({
  selector: 'app-call-card',
  imports: [FormsModule, CallSlots],
  template: `
    <article class="flex flex-col gap-3 rounded-lg border border-border p-4">
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div>
          <a
            class="font-semibold text-primary"
            [href]="
              '/courses/' + call().course_id + '/' + call().chapter_id + '/' + call().lesson_id
            "
            >{{ call().lesson_title }}</a
          >
          <p class="text-sm text-text-muted">{{ call().course_title }}</p>
        </div>
        <span class="rounded-full bg-input px-3 py-1 text-xs">{{
          t('calls-status-' + call().status)
        }}</span>
      </div>
      <p>{{ date(call().starts_at) }} – {{ time(call().ends_at) }} · {{ zone }}</p>
      <p class="text-sm">{{ call().teacher_name }} · {{ call().student_name }}</p>
      @if (call().meeting_url) {
        <a
          class="text-primary underline"
          [href]="call().meeting_url"
          target="_blank"
          rel="noopener noreferrer"
          >{{ t('calls-join') }}</a
        >
      }
      @if (error()) {
        <p role="alert" class="text-danger">{{ error() }}</p>
      }
      @if (call().status === 'scheduled') {
        <div class="flex flex-wrap gap-2">
          @if (manager() || future()) {
            <button
              type="button"
              class="rounded-md bg-input px-3 py-2 disabled:opacity-50"
              [disabled]="busy()"
              (click)="open('reschedule')"
            >
              {{ t('calls-reschedule') }}
            </button>
            <button
              type="button"
              class="rounded-md bg-input px-3 py-2 text-danger disabled:opacity-50"
              [disabled]="busy()"
              (click)="open('cancel')"
            >
              {{ t('calls-cancel') }}
            </button>
          }
          @if (manager()) {
            <button
              type="button"
              class="rounded-md bg-input px-3 py-2"
              [disabled]="busy()"
              (click)="open('link')"
            >
              {{ t('calls-link') }}
            </button>
            @if (ended()) {
              <button
                type="button"
                class="rounded-md bg-primary px-3 py-2 text-text-inverse"
                [disabled]="busy()"
                (click)="change('complete')"
              >
                {{ t('calls-complete') }}
              </button>
            }
          }
        </div>
      }
      @if (editor() === 'cancel') {
        <p>{{ t('calls-cancel-confirm') }}</p>
        <button
          type="button"
          class="w-fit rounded-md bg-danger px-3 py-2 text-white"
          [disabled]="busy()"
          (click)="change('cancel')"
        >
          {{ t('calls-confirm') }}
        </button>
      }
      @if (editor() === 'link') {
        <label class="flex flex-col gap-1"
          >{{ t('calls-link')
          }}<input
            type="url"
            class="rounded-md bg-input p-3"
            [(ngModel)]="url"
            placeholder="https://"
        /></label>
        <button
          type="button"
          class="w-fit rounded-md bg-primary px-3 py-2 text-text-inverse"
          [disabled]="busy()"
          (click)="change('link', { meeting_url: url })"
        >
          {{ t('calls-save') }}
        </button>
      }
      @if (editor() === 'reschedule') {
        @if (manager()) {
          <label class="flex flex-col gap-1"
            >{{ t('calls-new-time') }} · {{ zone
            }}<input type="datetime-local" class="rounded-md bg-input p-3" [(ngModel)]="start"
          /></label>
          <button
            type="button"
            class="w-fit rounded-md bg-primary px-3 py-2 text-text-inverse"
            [disabled]="busy() || !start"
            (click)="move()"
          >
            {{ t('calls-confirm') }}
          </button>
        } @else {
          <app-call-slots
            [key]="call()"
            [except]="call().id"
            [disabled]="busy()"
            (chosen)="change('reschedule', { starts_at: $event })"
          />
        }
      }
      @if (editor()) {
        <button
          type="button"
          class="w-fit text-sm underline"
          [disabled]="busy()"
          (click)="editor.set('')"
        >
          {{ t('calls-close') }}
        </button>
      }
    </article>
  `,
})
export class CallCard {
  readonly call = input.required<CallBooking>();
  readonly changed = output<void>();
  private session = inject(SessionStore);
  private api = inject(ApiService);
  private i18n = inject(I18nService);
  readonly zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  readonly editor = signal('');
  readonly error = signal('');
  readonly busy = signal(false);
  start = '';
  url = '';
  manager() {
    return (
      this.session.isAdmin() ||
      (this.session.user()?.role === 'teacher' &&
        this.session.user()?.id === this.call().teacher_id)
    );
  }
  future() {
    return this.call().starts_at > Date.now() / 1000;
  }
  ended() {
    return this.call().ends_at <= Date.now() / 1000;
  }
  t(key: string) {
    return this.i18n.format(key);
  }
  date(epoch: number) {
    return new Date(epoch * 1000).toLocaleString(this.i18n.locale(), {
      dateStyle: 'medium',
      timeStyle: 'short',
      hourCycle: 'h23',
    });
  }
  time(epoch: number) {
    return new Date(epoch * 1000).toLocaleTimeString(this.i18n.locale(), {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
  }
  open(editor: string) {
    this.error.set('');
    this.start = localCallInput(this.call().starts_at, this.zone);
    this.url = this.call().meeting_url;
    this.editor.set(editor);
  }
  move() {
    try {
      void this.change('reschedule', { starts_at: localCallTime(this.start, this.zone) });
    } catch {
      this.error.set(this.t('calls-invalid-time'));
    }
  }
  async change(action: string, patch: { starts_at?: number; meeting_url?: string } = {}) {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.api.changeCall(this.call(), action, patch);
      this.editor.set('');
      this.changed.emit();
    } catch (e) {
      this.error.set(
        this.t(
          e instanceof ApiError && e.status === 409
            ? 'calls-conflict'
            : e instanceof ApiError && e.code === 'bad_request'
              ? 'calls-invalid'
              : 'error-generic',
        ),
      );
      if (e instanceof ApiError && e.status === 409) {
        this.editor.set('');
        this.changed.emit();
      }
    } finally {
      this.busy.set(false);
    }
  }
}
