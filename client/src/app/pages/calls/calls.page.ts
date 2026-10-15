import { Component, inject, signal, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CallBooking } from '../../core/api.types';
import { ApiService } from '../../core/api.service';
import { I18nService } from '../../core/i18n.service';
import { SessionStore } from '../../core/session.store';
import { CallCard } from '../../shared/call-card';
import { Skeleton, Spinner } from '../../shared/loading';

@Component({
  selector: 'app-calls',
  imports: [CallCard, Skeleton, Spinner, RouterLink],
  template: `
    <section class="design-page">
      @if (session.user()?.role === 'teacher') {
        <header class="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 class="font-heading text-2xl font-semibold md:text-[28px]">{{ t('calls-title-upcoming') }}</h1>
            <p class="mt-2 text-sm text-text-muted">{{ t('calls-teacher-subtitle') }}</p>
          </div>
          <a routerLink="/calls/schedule" class="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-text-inverse">
            {{ t('calls-open-schedule') }}
          </a>
        </header>
        @if (error()) { <p role="alert" class="text-danger">{{ error() }}</p> }
        @if (loading()) {
          <div role="status" class="grid gap-3 sm:grid-cols-3">
            @for (item of [1,2,3]; track item) { <app-skeleton class="h-20 rounded-xl" /> }
          </div>
        } @else {
          <div class="grid gap-3 sm:grid-cols-3">
            <article class="rounded-xl bg-surface p-5"><strong class="block text-2xl text-primary">{{ countToday() }}</strong><span class="text-sm text-text-muted">{{ t('calls-today') }}</span></article>
            <article class="rounded-xl bg-surface p-5"><strong class="block text-2xl">{{ countWeek() }}</strong><span class="text-sm text-text-muted">{{ t('calls-this-week') }}</span></article>
            <article class="rounded-xl bg-surface p-5"><strong class="block text-2xl text-primary">{{ upcoming().length }}</strong><span class="text-sm text-text-muted">{{ t('calls-upcoming-count') }}</span></article>
          </div>
          <div class="grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(260px,0.9fr)]">
            <section class="flex min-w-0 flex-col gap-3 rounded-xl bg-surface p-4 sm:p-6" aria-labelledby="agenda-title">
              <div class="flex items-center justify-between gap-3"><h2 id="agenda-title" class="font-heading text-lg font-semibold">{{ t('calls-next-meetings') }}</h2><a routerLink="/calls/schedule" class="text-sm text-primary">{{ t('calls-calendar-link') }}</a></div>
              @for (call of upcoming(); track call.id) { <app-call-card [call]="call" (changed)="load()" /> }
              @if (!upcoming().length) { <p class="py-8 text-center text-sm text-text-muted">{{ t('calls-empty') }}</p> }
            </section>
            <aside class="rounded-xl bg-surface p-5 sm:p-6">
              <h2 class="font-heading text-lg font-semibold">{{ t('calls-today') }}</h2>
              @if (nextCall(); as call) {
                <p class="mt-2 text-sm text-text-muted">{{ date(call.starts_at) }}</p>
                <p class="mt-5 text-3xl font-semibold text-primary">{{ time(call.starts_at) }}</p>
                <p class="mt-2 font-semibold">{{ call.lesson_title }}</p>
                <p class="mt-1 text-sm text-text-secondary">{{ call.student_name }} · {{ call.course_title }}</p>
                @if (call.meeting_url) { <a [href]="call.meeting_url" target="_blank" rel="noopener noreferrer" class="mt-5 inline-flex rounded-full bg-primary px-4 py-2 text-sm text-text-inverse">{{ t('calls-join') }}</a> }
              } @else { <p class="mt-5 text-sm text-text-muted">{{ t('calls-no-meetings-today') }}</p> }
              <a routerLink="/calls/schedule/template" class="mt-6 block border-t border-border pt-4 text-sm text-primary">{{ t('calls-template-link') }}</a>
            </aside>
          </div>
        }
      } @else if (session.user()?.role === 'student') {
        <header>
          <h1 class="font-heading text-2xl font-semibold md:text-[28px]">{{ t('nav-calls') }}</h1>
          <p class="mt-2 text-sm text-text-muted">{{ t('calls-student-subtitle') }}</p>
        </header>
        <div class="flex flex-wrap gap-2" role="group" [attr.aria-label]="t('calls-filter')">
          @for (tab of studentTabs; track tab) {
            <button type="button" class="rounded-full px-4 py-2 text-sm" [class.bg-primary]="filter() === tab" [class.text-text-inverse]="filter() === tab" [class.bg-input]="filter() !== tab" [attr.aria-pressed]="filter() === tab" (click)="filter.set(tab)">{{ t('calls-tab-' + tab) }}</button>
          }
        </div>
        @if (error()) { <p role="alert" class="text-danger">{{ error() }}</p> }
        @if (loading()) { <p role="status" class="flex items-center gap-2 text-sm text-text-muted"><app-spinner />{{ t('calls-loading') }}</p> }
        @else {
          @if (nextCall(); as call) {
            <article class="flex flex-wrap items-center justify-between gap-5 rounded-2xl bg-primary p-6 text-text-inverse sm:p-8">
              <div><p class="text-xs font-semibold uppercase tracking-wide text-primary-soft">{{ t('calls-next-call') }}</p><h2 class="mt-3 font-heading text-xl font-semibold">{{ call.lesson_title }}</h2><p class="mt-2 text-sm text-primary-soft">{{ call.teacher_name }} · {{ call.course_title }}</p><p class="mt-1 text-sm text-primary-soft">{{ date(call.starts_at) }} · {{ time(call.starts_at) }}–{{ time(call.ends_at) }}</p></div>
              @if (call.meeting_url) { <a [href]="call.meeting_url" target="_blank" rel="noopener noreferrer" class="rounded-full bg-surface px-5 py-2.5 text-sm font-semibold text-primary">{{ t('calls-join') }}</a> }
            </article>
          }
          <div class="flex items-center justify-between"><h2 class="font-heading text-lg font-semibold">{{ t(filter() === 'history' ? 'calls-history' : 'calls-upcoming') }}</h2><a routerLink="/courses" class="text-sm text-primary">{{ t('calls-book-from-course') }}</a></div>
          @for (call of visible(); track call.id) { <app-call-card [call]="call" (changed)="load()" /> }
          @if (!visible().length) { <p class="rounded-xl bg-surface p-6 text-center text-sm text-text-muted">{{ t('calls-empty') }}</p> }
        }
      } @else {
        <header class="flex flex-wrap items-center justify-between gap-4"><div><h1 class="font-heading text-2xl font-semibold md:text-[28px]">{{ t('nav-calls') }}</h1><p class="mt-2 text-sm text-text-muted">{{ t('calls-admin-subtitle') }}</p></div><div class="flex flex-wrap gap-2" role="group" [attr.aria-label]="t('calls-filter')">@for (tab of adminTabs; track tab) { <button type="button" class="rounded-full px-4 py-2 text-sm" [class.bg-primary]="filter() === tab" [class.text-text-inverse]="filter() === tab" [class.bg-input]="filter() !== tab" [attr.aria-pressed]="filter() === tab" (click)="filter.set(tab)">{{ t('calls-tab-' + tab) }}</button> }</div></header>
        @if (error()) { <p role="alert" class="text-danger">{{ error() }}</p> }
        @if (loading()) { <p role="status" class="flex items-center gap-2 text-sm text-text-muted"><app-spinner />{{ t('calls-loading') }}</p> }
        @else { @for (call of visible(); track call.id) { <app-call-card [call]="call" (changed)="load()" /> } @if (!visible().length) { <p class="text-text-muted">{{ t('calls-empty') }}</p> } }
      }
    </section>
  `,
})
export class CallsPage implements OnInit {
  readonly session = inject(SessionStore);
  private api = inject(ApiService);
  private i18n = inject(I18nService);
  readonly calls = signal<CallBooking[]>([]);
  readonly error = signal('');
  readonly loading = signal(false);
  readonly studentTabs = ['upcoming', 'history'];
  readonly adminTabs = ['upcoming', 'history', 'all'];
  readonly filter = signal('upcoming');

  t(key: string) { return this.i18n.format(key); }
  ngOnInit() { void this.load(); }
  time(epoch: number) { return new Date(epoch * 1000).toLocaleTimeString(this.i18n.locale(), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); }
  date(epoch: number) { return new Date(epoch * 1000).toLocaleDateString(this.i18n.locale(), { weekday: 'long', day: 'numeric', month: 'long' }); }
  upcoming() { return this.calls().filter((c) => c.status === 'scheduled' && c.ends_at > Date.now() / 1000).sort((a,b) => a.starts_at-b.starts_at); }
  nextCall() { return this.upcoming()[0] ?? null; }
  countToday() { const d = new Date(); return this.upcoming().filter((c) => new Date(c.starts_at * 1000).toDateString() === d.toDateString()).length; }
  countWeek() { const now = new Date(); const end = new Date(now); end.setDate(now.getDate() + 7); return this.upcoming().filter((c) => c.starts_at * 1000 < end.getTime()).length; }
  visible() {
    const now = Date.now() / 1000;
    return this.calls().filter((c) => this.filter() === 'all' || (this.filter() === 'upcoming' ? c.status === 'scheduled' && c.ends_at > now : c.status !== 'scheduled' || c.ends_at <= now)).sort((a,b) => this.filter() === 'history' ? b.starts_at-a.starts_at : a.starts_at-b.starts_at);
  }
  async load() {
    this.loading.set(true); this.error.set('');
    try { this.calls.set((await this.api.calls()).calls); }
    catch { this.error.set(this.t('error-generic')); }
    finally { this.loading.set(false); }
  }
}
