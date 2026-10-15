import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { CallBooking, TeacherSchedule } from '../../core/api.types';
import { I18nService } from '../../core/i18n.service';
import { Spinner } from '../../shared/loading';

@Component({
  selector: 'app-call-schedule',
  imports: [RouterLink, Spinner],
  template: `
    <section class="design-page">
      <header class="flex flex-wrap items-start justify-between gap-4"><div><h1 class="font-heading text-2xl font-semibold md:text-[28px]">{{ t('calls-schedule-title') }}</h1><p class="mt-2 text-sm text-text-muted">{{ t('calls-schedule-subtitle') }}</p></div><div class="flex gap-2"><a routerLink="/calls/schedule/template" class="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-text-inverse">{{ t('calls-edit-template') }}</a><a routerLink="/calls" class="rounded-full bg-input px-4 py-2 text-sm">{{ t('calls-back') }}</a></div></header>
      @if (error()) { <p role="alert" class="text-danger">{{ error() }}</p> }
      @if (loading()) { <p role="status" class="flex items-center gap-2 text-sm text-text-muted"><app-spinner />{{ t('calls-loading') }}</p> }
      @else if (schedule()) {
        <section class="rounded-xl bg-surface p-4 sm:p-6">
          <div class="mb-5 flex flex-wrap items-center justify-between gap-3"><p class="text-sm text-text-secondary">{{ t('calls-your-zone') }} · {{ schedule()!.timezone }}</p><div class="flex items-center gap-3"><button type="button" class="h-9 w-9 rounded-full bg-input text-lg" [attr.aria-label]="t('calls-previous-week')" (click)="moveWeek(-1)">‹</button><span class="min-w-40 text-center text-sm font-semibold">{{ weekLabel() }}</span><button type="button" class="h-9 w-9 rounded-full bg-input text-lg" [attr.aria-label]="t('calls-next-week')" (click)="moveWeek(1)">›</button></div></div>
          <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
            @for (date of weekDays(); track date) {
              <button type="button" class="min-h-40 rounded-xl border border-border p-3 text-left" [class.bg-primary-soft]="date === selectedDate()" [class.ring-2]="date === selectedDate()" [class.ring-primary]="date === selectedDate()" [attr.aria-pressed]="date === selectedDate()" (click)="selectedDate.set(date)">
                <span class="block text-xs uppercase text-text-muted">{{ weekday(date) }}</span><span class="mt-1 block font-semibold">{{ dayLabel(date) }}</span>
                @if (isException(date)) { <span class="mt-3 block rounded-md bg-warning-soft px-2 py-1 text-xs text-primary">{{ t('calls-date-exception') }}</span> }
                @for (window of windowsFor(date); track $index) { <span class="mt-2 block rounded-md bg-primary-soft px-2 py-1 text-xs text-primary">{{ window.start_time }}–{{ window.end_time }}</span> }
                @if (!isException(date) && !windowsFor(date).length) { <span class="mt-3 block text-xs text-text-muted">{{ t('calls-unavailable') }}</span> }
                @for (call of callsFor(date); track call.id) { <span class="mt-2 block truncate rounded-md bg-input px-2 py-1 text-xs">{{ time(call.starts_at) }} · {{ call.student_name }}</span> }
              </button>
            }
          </div>
        </section>
        <section class="rounded-xl bg-surface p-5 sm:p-6"><h2 class="font-heading text-lg font-semibold">{{ fullDate(selectedDate()) }}</h2><p class="mt-2 text-sm text-text-muted">{{ t('calls-day-zone') }} · {{ schedule()!.timezone }}</p>
          @if (callsFor(selectedDate()).length) { <div class="mt-4 flex flex-col gap-2">@for (call of callsFor(selectedDate()); track call.id) { <article class="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-input p-3"><div><p class="font-semibold">{{ call.lesson_title }} · {{ call.student_name }}</p><p class="text-xs text-text-muted">{{ call.course_title }}</p></div><p class="text-sm font-semibold text-primary">{{ time(call.starts_at) }}–{{ time(call.ends_at) }}</p></article> }</div> }
          @if (!windowsFor(selectedDate()).length && !callsFor(selectedDate()).length) { <p class="mt-4 text-sm text-text-muted">{{ t(isException(selectedDate()) ? 'calls-date-closed' : 'calls-no-availability') }}</p> }
          @if (windowsFor(selectedDate()).length) { <div class="mt-4 flex flex-wrap gap-2">@for (window of windowsFor(selectedDate()); track $index) { <span class="rounded-full bg-primary-soft px-3 py-1 text-sm text-primary">{{ window.start_time }}–{{ window.end_time }}</span> }</div> }
        </section>
      }
    </section>
  `,
})
export class CallSchedulePage implements OnInit {
  private api = inject(ApiService);
  private i18n = inject(I18nService);
  readonly schedule = signal<TeacherSchedule | null>(null);
  readonly calls = signal<CallBooking[]>([]);
  readonly selectedDate = signal(this.dateKey(new Date()));
  readonly loading = signal(true);
  readonly error = signal('');
  t(key: string) { return this.i18n.format(key); }
  private dateKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; }
  private localDate(key: string) { return new Date(`${key}T12:00:00`); }
  weekDays() { const monday=this.localDate(this.selectedDate()); monday.setDate(monday.getDate()-((monday.getDay()+6)%7)); return Array.from({length:7},(_,i)=>{const d=new Date(monday);d.setDate(monday.getDate()+i);return this.dateKey(d);}); }
  weekLabel() { const dates=this.weekDays().map(d=>this.localDate(d));const f=new Intl.DateTimeFormat(this.i18n.locale(),{day:'numeric',month:'short'});return `${f.format(dates[0])} – ${f.format(dates[6])}`; }
  weekday(date:string) { return this.localDate(date).toLocaleDateString(this.i18n.locale(),{weekday:'short'}); }
  dayLabel(date:string) { return this.localDate(date).toLocaleDateString(this.i18n.locale(),{day:'numeric',month:'short'}); }
  fullDate(date:string) { return this.localDate(date).toLocaleDateString(this.i18n.locale(),{weekday:'long',day:'numeric',month:'long'}); }
  time(epoch:number) { return new Date(epoch*1000).toLocaleTimeString(this.i18n.locale(),{hour:'2-digit',minute:'2-digit',hourCycle:'h23'}); }
  moveWeek(weeks:number) { const d=this.localDate(this.selectedDate());d.setDate(d.getDate()+weeks*7);this.selectedDate.set(this.dateKey(d)); }
  exception(date:string) { return this.schedule()?.exceptions.find((item)=>item.date===date); }
  isException(date:string) { return !!this.exception(date); }
  windowsFor(date:string) { const schedule=this.schedule();if(!schedule)return[];const exception=this.exception(date);if(exception)return exception.windows;const weekday=this.localDate(date).getDay();return schedule.weekly_windows.filter((window)=>window.weekday===weekday); }
  private dateInZone(epoch:number) { const parts=new Intl.DateTimeFormat('en-CA',{timeZone:this.schedule()?.timezone||undefined,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(epoch*1000));const part=(type:string)=>parts.find((item)=>item.type===type)?.value??'';return `${part('year')}-${part('month')}-${part('day')}`; }
  callsFor(date:string) { return this.calls().filter((call)=>this.dateInZone(call.starts_at)===date&&call.status==='scheduled'); }
  ngOnInit() { void this.load(); }
  async load() { this.loading.set(true);this.error.set('');try{const [schedule,calls]=await Promise.all([this.api.teacherSchedule(),this.api.calls()]);if(!schedule.timezone)schedule.timezone=Intl.DateTimeFormat().resolvedOptions().timeZone;this.schedule.set(schedule);this.calls.set(calls.calls);}catch{this.error.set(this.t('error-generic'));}finally{this.loading.set(false);} }
}
