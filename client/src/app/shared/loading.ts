import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-spinner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: inline-flex;
      flex: none;
    }
  `,
  template: `
    <svg
      [class]="'motion-reduce:animate-none ' + extra()"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle class="opacity-25" cx="12" cy="12" r="9" stroke="currentColor" stroke-width="3" />
      <path class="opacity-90" fill="currentColor" d="M12 3a9 9 0 0 1 9 9h-3a6 6 0 0 0-6-6V3Z" />
    </svg>
  `,
})
export class Spinner {
  readonly extra = input('h-4 w-4 animate-spin');
}

@Component({
  selector: 'app-skeleton',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: block;
    }
  `,
  template: `<span
    class="block h-full w-full animate-pulse rounded-[inherit] bg-input motion-reduce:animate-none"
    aria-hidden="true"
  ></span>`,
})
export class Skeleton {}
