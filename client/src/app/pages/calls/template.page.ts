import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiError, ApiService } from '../../core/api.service';
import { TeacherSchedule } from '../../core/api.types';
import { I18nService } from '../../core/i18n.service';
import { Spinner } from '../../shared/loading';

@Component({
  selector: 'app-call-template',
  imports: [FormsModule, RouterLink, Spinner],
  template: `
    <section class="design-page">
      <header class="flex flex-wrap items-start justify-between gap-4"><div><h1 class="font-heading text-2xl font-semibold md:text-[28px]">{{ t('calls-template-title') }}</h1><p class="mt-2 max-w-3xl text-sm text-text-muted">{{ t('calls-template-subtitle') }}</p></div><a routerLink="/calls/schedule" class="rounded-full bg-input px-4 py-2 text-sm">{{ t('calls-back') }}</a></header>
      @if (error()) { <p role="alert" class="text-danger">{{ error() }}</p> }
      @if (loading()) { <p role="status" class="flex items-center gap-2 text-sm text-text-muted"><app-spinner />{{ t('calls-loading') }}</p> }
      @else if (schedule()) {
        <div class="grid gap-5 xl:grid-cols-[minmax(0,1.8fr)_minmax(280px,0.9fr)]">
          <section class="rounded-xl bg-surface p-4 sm:p-6"><h2 class="font-heading text-lg font-semibold">{{ t('calls-weekly-slots') }}</h2><p class="mb-5 mt-2 text-sm text-text-muted">{{ t('calls-template-help') }}</p>
            <div class="flex flex-col gap-3">
              @for (weekday of weekdays; track weekday) {
                <div class="rounded-xl p-3" [class.bg-primary-soft]="weeklyWindows(weekday).length" [class.bg-input]="!weeklyWindows(weekday).length">
                  <div class="flex flex-wrap items-center justify-between gap-2"><h3 class="font-semibold">{{ weekdayLabel(weekday) }}</h3><button type="button" class="rounded-full bg-surface px-3 py-1 text-sm text-primary" (click)="addWeekly(weekday)">+ {{ t('calls-add-time') }}</button></div>
                  @for (window of weeklyWindows(weekday); track $index; let i = $index) {
                    <div class="mt-2 flex flex-wrap items-center gap-2"><input type="time" class="rounded-md border border-border bg-surface px-3 py-2" [ngModel]="window.start_time" (ngModelChange)="updateWeekly(weekday,i,'start_time',$event)" [attr.aria-label]="t('calls-start') + ' ' + weekdayLabel(weekday)" /><span>–</span><input type="time" class="rounded-md border border-border bg-surface px-3 py-2" [ngModel]="window.end_time" (ngModelChange)="updateWeekly(weekday,i,'end_time',$event)" [attr.aria-label]="t('calls-end') + ' ' + weekdayLabel(weekday)" /><button type="button" class="ml-auto px-2 py-2 text-sm text-danger" (click)="removeWeekly(weekday,i)">{{ t('calls-remove-window') }}</button></div>
                  } @empty { <p class="mt-2 text-xs text-text-muted">{{ t('calls-no-weekly-times') }}</p> }
                </div>
              }
            </div>
          </section>
          <aside class="flex flex-col gap-5">
            <section class="rounded-xl bg-surface p-5"><h2 class="font-heading text-lg font-semibold">{{ t('calls-repeat-rules') }}</h2><label class="mt-5 flex flex-col gap-2 text-sm">{{ t('calls-horizon') }}<select class="rounded-md border border-border bg-input px-3 py-2" [ngModel]="schedule()!.horizon_weeks" (ngModelChange)="setHorizon($event)">@for (weeks of horizons; track weeks) { <option [ngValue]="weeks">{{ weeks }} {{ t('calls-weeks') }}</option> }</select></label><label class="mt-4 flex flex-col gap-2 text-sm">{{ t('calls-timezone') }}<select class="max-w-full rounded-md border border-border bg-input px-3 py-2" [ngModel]="schedule()!.timezone" (ngModelChange)="setTimezone($event)">@for (zone of zones; track zone) { <option [value]="zone">{{ zone }}</option> }</select></label><p class="mt-4 rounded-lg bg-primary-soft p-3 text-sm text-primary">{{ t('calls-template-preview') }} · {{ schedule()!.horizon_weeks }} {{ t('calls-weeks') }}</p></section>
            <section class="rounded-xl bg-surface p-5"><h2 class="font-heading text-lg font-semibold">{{ t('calls-exceptions') }}</h2><p class="mt-2 text-sm text-text-muted">{{ t('calls-exceptions-help') }}</p><div class="mt-4 flex flex-wrap items-end gap-2"><label class="flex flex-col gap-1 text-xs text-text-muted">{{ t('calls-calendar-date') }}<input type="date" class="rounded-md border border-border bg-input px-3 py-2 text-sm" [min]="today" [ngModel]="exceptionDate()" (ngModelChange)="exceptionDate.set($event)" /></label><button type="button" class="rounded-full bg-primary-soft px-4 py-2 text-sm text-primary" (click)="addException()">+ {{ t('calls-add-exception') }}</button></div>
              @for (exception of schedule()!.exceptions; track exception.date) {
                <article class="mt-3 rounded-lg bg-input p-3"><div class="flex items-center justify-between gap-2"><div><h3 class="font-semibold">{{ fullDate(exception.date) }}</h3><p class="text-xs text-text-muted">{{ exception.windows.length ? t('calls-date-override') : t('calls-date-closed') }}</p></div><button type="button" class="text-sm text-danger" (click)="removeException(exception.date)">{{ t('calls-remove-window') }}</button></div>
                  @for (window of exception.windows; track $index; let i=$index) { <div class="mt-2 flex flex-wrap items-center gap-2"><input type="time" class="rounded-md border border-border bg-surface px-3 py-2" [ngModel]="window.start_time" (ngModelChange)="updateException(exception.date,i,'start_time',$event)" [attr.aria-label]="t('calls-start')" /><span>–</span><input type="time" class="rounded-md border border-border bg-surface px-3 py-2" [ngModel]="window.end_time" (ngModelChange)="updateException(exception.date,i,'end_time',$event)" [attr.aria-label]="t('calls-end')" /><button type="button" class="ml-auto text-sm text-danger" (click)="removeExceptionWindow(exception.date,i)">{{ t('calls-remove-window') }}</button></div> }
                  <button type="button" class="mt-3 text-sm text-primary" (click)="addExceptionWindow(exception.date)">+ {{ t('calls-add-interval') }}</button>
                </article>
              } @empty { <p class="mt-4 text-sm text-text-muted">{{ t('calls-no-exceptions') }}</p> }
            </section>
          </aside>
        </div>
        <footer class="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-primary-soft p-4"><p class="text-sm text-text-secondary">{{ t('calls-template-apply-note') }}</p><button type="button" class="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-text-inverse disabled:opacity-50" [disabled]="saving()" (click)="save()">@if (saving()) { <app-spinner /> }{{ t('calls-save-template') }}</button></footer>
        @if (saved()) { <p role="status" class="text-sm text-primary">{{ t('calls-template-saved') }}</p> }
      }
    </section>
  `,
})
export class CallTemplatePage implements OnInit {
  private api=inject(ApiService);private i18n=inject(I18nService);
  readonly schedule=signal<TeacherSchedule|null>(null);readonly loading=signal(true);readonly saving=signal(false);readonly saved=signal(false);readonly error=signal('');readonly exceptionDate=signal(this.dateKey(new Date()));
  readonly weekdays=[1,2,3,4,5,6,0];readonly horizons=[4,8,12,26,52];readonly today=this.dateKey(new Date());
  readonly zones=Array.from(new Set([Intl.DateTimeFormat().resolvedOptions().timeZone,'UTC',...Intl.supportedValuesOf('timeZone')])).sort();
  t(key:string){return this.i18n.format(key);}
  private dateKey(date:Date){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;}
  private touch(next:TeacherSchedule){this.schedule.set(next);this.saved.set(false);this.error.set('');}
  weekdayLabel(weekday:number){const date=new Date(2024,0,1+((weekday+6)%7),12);return date.toLocaleDateString(this.i18n.locale(),{weekday:'long'});}
  fullDate(date:string){return new Date(`${date}T12:00:00`).toLocaleDateString(this.i18n.locale(),{weekday:'short',day:'numeric',month:'long'});}
  weeklyWindows(weekday:number){return this.schedule()?.weekly_windows.filter((window)=>window.weekday===weekday)??[];}
  ngOnInit(){void this.load();}
  async load(){this.loading.set(true);this.error.set('');try{const schedule=await this.api.teacherSchedule();if(!schedule.timezone)schedule.timezone=Intl.DateTimeFormat().resolvedOptions().timeZone;this.schedule.set(schedule);}catch{this.error.set(this.t('error-generic'));}finally{this.loading.set(false);}}
  addWeekly(weekday:number){const current=this.schedule();if(!current)return;this.touch({...current,weekly_windows:[...current.weekly_windows,{weekday,start_time:'09:00',end_time:'12:00'}]});}
  updateWeekly(weekday:number,index:number,field:'start_time'|'end_time',value:string){const current=this.schedule();if(!current)return;let count=0;const weekly=current.weekly_windows.map((window)=>{if(window.weekday!==weekday)return window;if(count++!==index)return window;return {...window,[field]:value};});this.touch({...current,weekly_windows:weekly});}
  removeWeekly(weekday:number,index:number){const current=this.schedule();if(!current)return;let count=0;this.touch({...current,weekly_windows:current.weekly_windows.filter((window)=>window.weekday!==weekday||count++!==index)});}
  setHorizon(value:number){const current=this.schedule();if(current)this.touch({...current,horizon_weeks:Number(value)});}
  setTimezone(value:string){const current=this.schedule();if(current)this.touch({...current,timezone:value});}
  addException(){const current=this.schedule(),date=this.exceptionDate();if(!current||!date||date<this.today||current.exceptions.some((exception)=>exception.date===date))return;this.touch({...current,exceptions:[...current.exceptions,{date,windows:[]}].sort((a,b)=>a.date.localeCompare(b.date))});}
  removeException(date:string){const current=this.schedule();if(current)this.touch({...current,exceptions:current.exceptions.filter((exception)=>exception.date!==date)});}
  addExceptionWindow(date:string){const current=this.schedule();if(!current)return;this.touch({...current,exceptions:current.exceptions.map((exception)=>exception.date===date?{...exception,windows:[...exception.windows,{start_time:'09:00',end_time:'10:00'}]}:exception)});}
  updateException(date:string,index:number,field:'start_time'|'end_time',value:string){const current=this.schedule();if(!current)return;this.touch({...current,exceptions:current.exceptions.map((exception)=>{if(exception.date!==date)return exception;return {...exception,windows:exception.windows.map((window,i)=>i===index?{...window,[field]:value}:window)};})});}
  removeExceptionWindow(date:string,index:number){const current=this.schedule();if(!current)return;this.touch({...current,exceptions:current.exceptions.map((exception)=>exception.date===date?{...exception,windows:exception.windows.filter((_,i)=>i!==index)}:exception)});}
  async save(){const current=this.schedule();if(!current||this.saving())return;this.saving.set(true);this.saved.set(false);this.error.set('');try{this.schedule.set(await this.api.saveTeacherSchedule(current));this.saved.set(true);}catch(error){this.error.set(this.t(error instanceof ApiError&&error.status===409?'calls-settings-conflict':error instanceof ApiError&&error.code==='bad_request'?'calls-schedule-invalid':'error-generic'));}finally{this.saving.set(false);}}
}
