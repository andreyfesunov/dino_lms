import {
  afterNextRender,
  DestroyRef,
  Directive,
  ElementRef,
  HostListener,
  inject,
} from '@angular/core';

@Directive({ selector: '[appDialogFocus]' })
export class DialogFocus {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly previous = document.activeElement as HTMLElement | null;

  constructor() {
    afterNextRender(() => {
      const search = this.element.querySelector<HTMLInputElement>(
        'input[type="search"]:not(:disabled)',
      );
      (search ?? this.controls()[0])?.focus();
    });
    inject(DestroyRef).onDestroy(() => {
      if (this.previous?.isConnected) this.previous.focus();
    });
  }

  private controls(): HTMLElement[] {
    return Array.from(
      this.element.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]',
      ),
    ).filter((el) => el.getClientRects().length > 0);
  }

  @HostListener('keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Tab') return;
    const controls = this.controls();
    if (!controls.length) {
      event.preventDefault();
      return;
    }
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (
      event.shiftKey &&
      (document.activeElement === first || !this.element.contains(document.activeElement))
    ) {
      event.preventDefault();
      last.focus();
    } else if (
      !event.shiftKey &&
      (document.activeElement === last || !this.element.contains(document.activeElement))
    ) {
      event.preventDefault();
      first.focus();
    }
  }
}
