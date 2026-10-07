import { Component, inject, input, output, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { CallKey, CallWindow } from '../core/api.types';
import { I18nService } from '../core/i18n.service';

@Component({
  selector: 'app-call-slots',
  imports: [FormsModule],
  template: `
    <div class="flex flex-col gap-3">
      <p class="text-sm text-text-muted">{{ t('calls-your-zone') }}: {{ zone }}</p>
      <label class="flex flex-col gap-1 text-sm"
        >{{ t('calls-date') }}
        <input
          type="date"
          class="rounded-md bg-input p-3"
          [min]="today"
          [ngModel]="day()"
          (ngModelChange)="day.set($event); load()"
        />
      </label>
      @if (error()) {
        <p role="alert" class="text-danger">{{ error() }}</p>
      }
      @if (loading()) {
        <p role="status">{{ t('calls-loading') }}</p>
      }
      <div class="flex flex-wrap gap-2">
        @for (slot of slots(); track slot.starts_at) {
          <button
            type="button"
            class="rounded-md border border-border px-3 py-2"
            [class.bg-primary-soft]="selected() === slot.starts_at"
            [attr.aria-pressed]="selected() === slot.starts_at"
            (click)="selected.set(slot.starts_at)"
          >
            {{ time(slot.starts_at) }}–{{ time(slot.ends_at) }}
          </button>
        } @empty {
          @if (!loading()) {
            <p class="text-sm text-text-muted">{{ t('calls-no-slots') }}</p>
          }
        }
      </div>
      @if (selected(); as start) {
        <button
          type="button"
          class="w-fit rounded-md bg-primary px-4 py-2 text-text-inverse disabled:opacity-50"
          [disabled]="disabled()"
          (click)="chosen.emit(start)"
        >
          {{ t('calls-confirm') }} · {{ time(start) }}
        </button>
      }
    </div>
  `,
})
export class CallSlots implements OnInit {
  readonly key = input.required<CallKey>();
  readonly except = input('');
  readonly disabled = input(false);
  readonly chosen = output<number>();
  private api = inject(ApiService);
  private i18n = inject(I18nService);
  readonly zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  readonly today = new Date().toLocaleDateString('sv-SE');
  readonly day = signal(this.today);
  readonly slots = signal<CallWindow[]>([]);
  readonly selected = signal<number | null>(null);
  readonly error = signal('');
  readonly loading = signal(false);
  private generation = 0;
  t(key: string) {
    return this.i18n.format(key);
  }
  time(epoch: number) {
    return new Date(epoch * 1000).toLocaleTimeString(this.i18n.locale(), {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
  }
  ngOnInit() {
    void this.load();
  }
  async load() {
    const generation = ++this.generation;
    this.selected.set(null);
    this.slots.set([]);
    this.error.set('');
    if (!this.day()) return;
    this.loading.set(true);
    const from = new Date(this.day() + 'T00:00:00');
    const to = new Date(from);
    to.setDate(to.getDate() + 1);
    try {
      const result = await this.api.callSlots(
        this.key(),
        from.getTime() / 1000,
        to.getTime() / 1000,
        this.except(),
      );
      if (generation === this.generation) this.slots.set(result.slots);
    } catch {
      if (generation === this.generation) this.error.set(this.t('error-generic'));
    } finally {
      if (generation === this.generation) this.loading.set(false);
    }
  }
}
