import { Component, inject, input, output, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { CallKey, CallWindow } from '../core/api.types';
import { I18nService } from '../core/i18n.service';
import { Spinner } from './loading';

@Component({
  selector: 'app-call-slots',
  imports: [FormsModule, Spinner],
  template: `
    <section class="flex flex-col gap-4" aria-labelledby="call-date-title">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div><h3 id="call-date-title" class="font-heading text-lg font-semibold">{{ t('calls-choose-date') }}</h3><p class="mt-1 text-sm text-text-muted">{{ t('calls-your-zone') }} · {{ zone }}</p></div>
        <label class="flex items-center gap-2 text-sm text-text-secondary">{{ t('calls-calendar-date') }}<input type="date" class="rounded-md border border-border bg-surface px-3 py-2" [min]="today" [ngModel]="day()" (ngModelChange)="selectDay($event)" /></label>
      </div>
      <div class="flex items-center justify-between gap-2">
        <button type="button" class="h-9 w-9 rounded-full bg-input text-lg" (click)="moveWeek(-1)" [attr.aria-label]="t('calls-previous-week')">‹</button>
        <p class="text-sm font-semibold">{{ weekLabel() }}</p>
        <button type="button" class="h-9 w-9 rounded-full bg-input text-lg" (click)="moveWeek(1)" [attr.aria-label]="t('calls-next-week')">›</button>
      </div>
      <div class="grid grid-cols-4 gap-2 sm:grid-cols-7" role="group" [attr.aria-label]="t('calls-choose-date')">
        @for (date of weekDays(); track date) {
          <button type="button" class="flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border border-transparent bg-input px-2 py-2 text-center" [class.bg-primary]="date === day()" [class.text-text-inverse]="date === day()" [class.border-primary]="date === day()" [disabled]="date < today" [attr.aria-pressed]="date === day()" [attr.aria-label]="fullDate(date)" (click)="selectDay(date)">
            <span class="text-[11px] uppercase opacity-75">{{ weekday(date) }}</span><span class="text-lg font-semibold">{{ dayNumber(date) }}</span>
          </button>
        }
      </div>
      @if (error()) { <p role="alert" class="text-danger">{{ error() }}</p> }
      @if (loading()) { <p role="status" class="flex items-center gap-2 text-sm text-text-muted"><app-spinner />{{ t('calls-loading') }}</p> }
      <div class="grid gap-2 sm:grid-cols-2">
        @for (slot of slots(); track slot.starts_at) {
          <button type="button" class="rounded-full border border-border px-4 py-2 text-sm" [class.bg-primary]="selected() === slot.starts_at" [class.text-text-inverse]="selected() === slot.starts_at" [attr.aria-pressed]="selected() === slot.starts_at" (click)="selected.set(slot.starts_at)">{{ time(slot.starts_at) }}–{{ time(slot.ends_at) }}</button>
        } @empty { @if (!loading() && !error()) { <p class="col-span-full text-sm text-text-muted">{{ t('calls-no-slots') }}</p> } }
      </div>
      @if (selected(); as start) {
        <button type="button" class="w-fit rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-text-inverse disabled:opacity-50" [disabled]="disabled()" (click)="chosen.emit(start)">@if (disabled()) { <app-spinner /> }{{ t('calls-confirm') }} · {{ time(start) }}</button>
      }
    </section>
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
  readonly today = this.dateKey(new Date());
  readonly day = signal(this.today);
  readonly slots = signal<CallWindow[]>([]);
  readonly selected = signal<number | null>(null);
  readonly error = signal('');
  readonly loading = signal(false);
  private generation = 0;

  t(key: string) { return this.i18n.format(key); }
  private dateKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; }
  private localDate(key: string) { return new Date(`${key}T12:00:00`); }
  weekDays() {
    const monday = this.localDate(this.day());
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    return Array.from({length: 7}, (_, i) => { const date = new Date(monday); date.setDate(monday.getDate()+i); return this.dateKey(date); });
  }
  weekLabel() {
    const dates = this.weekDays().map((d) => this.localDate(d));
    const fmt = new Intl.DateTimeFormat(this.i18n.locale(), {day:'numeric',month:'short'});
    return `${fmt.format(dates[0])} – ${fmt.format(dates[6])}`;
  }
  weekday(key: string) { return this.localDate(key).toLocaleDateString(this.i18n.locale(), {weekday:'short'}); }
  dayNumber(key: string) { return this.localDate(key).getDate(); }
  fullDate(key: string) { return this.localDate(key).toLocaleDateString(this.i18n.locale(), {weekday:'long',day:'numeric',month:'long'}); }
  time(epoch: number) { return new Date(epoch * 1000).toLocaleTimeString(this.i18n.locale(), {hour:'2-digit',minute:'2-digit',hourCycle:'h23'}); }
  selectDay(date: string) { if (date && date >= this.today) { this.day.set(date); void this.load(); } }
  moveWeek(weeks: number) {
    const date = this.localDate(this.day()); date.setDate(date.getDate() + weeks*7);
    const next = this.dateKey(date); if (next < this.today) return; this.selectDay(next);
  }
  ngOnInit() { void this.load(); }
  async load() {
    const generation = ++this.generation;
    this.selected.set(null); this.slots.set([]); this.error.set('');
    if (!this.day()) return;
    this.loading.set(true);
    const from = new Date(`${this.day()}T00:00:00`);
    const to = new Date(from); to.setDate(to.getDate()+1);
    try {
      const result = await this.api.callSlots(this.key(), from.getTime()/1000, to.getTime()/1000, this.except());
      if (generation === this.generation) this.slots.set(result.slots);
    } catch { if (generation === this.generation) this.error.set(this.t('error-generic')); }
    finally { if (generation === this.generation) this.loading.set(false); }
  }
}
