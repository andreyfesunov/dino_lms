import { Component, inject, signal, OnInit } from '@angular/core';
import { CallBooking } from '../../core/api.types';
import { ApiService } from '../../core/api.service';
import { I18nService } from '../../core/i18n.service';
import { CallCard } from '../../shared/call-card';

@Component({
  selector: 'app-calls',
  imports: [CallCard],
  template: `
    <section class="flex min-h-[calc(100vh-2rem)] flex-col gap-5 rounded-xl bg-surface p-5 md:p-8">
      <h1 class="font-heading text-[26px] font-semibold">{{ t('nav-calls') }}</h1>
      @if (error()) {
        <p role="alert" class="text-danger">{{ error() }}</p>
      }
      <div class="flex flex-wrap gap-2" role="group" [attr.aria-label]="t('calls-filter')">
        @for (tab of tabs; track tab) {
          <button
            type="button"
            class="rounded-md border border-border px-4 py-2"
            [class.bg-primary-soft]="filter() === tab"
            [attr.aria-pressed]="filter() === tab"
            (click)="filter.set(tab)"
          >
            {{ t('calls-tab-' + tab) }}
          </button>
        }
        <button type="button" class="rounded-md bg-input px-4 py-2" (click)="load()">
          {{ t('calls-refresh') }}
        </button>
      </div>
      @if (loading()) {
        <p role="status">{{ t('calls-loading') }}</p>
      }
      @for (call of visible(); track call.id) {
        <app-call-card [call]="call" (changed)="load()" />
      }
      @if (!loading() && visible().length === 0) {
        <p class="text-text-muted">{{ t('calls-empty') }}</p>
      }
    </section>
  `,
})
export class CallsPage implements OnInit {
  private api = inject(ApiService);
  private i18n = inject(I18nService);
  readonly calls = signal<CallBooking[]>([]);
  readonly error = signal('');
  readonly loading = signal(false);
  readonly tabs = ['upcoming', 'history', 'all'];
  readonly filter = signal('upcoming');
  t(key: string) {
    return this.i18n.format(key);
  }
  visible() {
    const now = Date.now() / 1000;
    return this.calls()
      .filter(
        (c) =>
          this.filter() === 'all' ||
          (this.filter() === 'upcoming'
            ? c.status === 'scheduled' && c.ends_at > now
            : c.status !== 'scheduled' || c.ends_at <= now),
      )
      .sort((a, b) =>
        this.filter() === 'history' ? b.starts_at - a.starts_at : a.starts_at - b.starts_at,
      );
  }
  ngOnInit() {
    void this.load();
  }
  async load() {
    this.loading.set(true);
    this.error.set('');
    try {
      this.calls.set((await this.api.calls()).calls);
    } catch {
      this.error.set(this.t('error-generic'));
    } finally {
      this.loading.set(false);
    }
  }
}
