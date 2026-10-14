import {
  afterRenderEffect,
  Directive,
  ElementRef,
  HostListener,
  inject,
  input,
} from '@angular/core';
import { I18nService } from '../core/i18n.service';

@Directive({ selector: '[appCodeBlocks]' })
export class CodeBlocks {
  readonly content = input('', { alias: 'appCodeBlocks' });
  readonly articleTitle = input('');
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly i18n = inject(I18nService);

  constructor() {
    afterRenderEffect(() => {
      this.content();
      const title = this.articleTitle();
      const heading = this.element.querySelector<HTMLElement>(':scope > h1:first-child');
      if (heading) heading.hidden = heading.textContent?.trim() === title.trim();
      this.i18n.locale();
      for (const pre of this.element.querySelectorAll('pre')) {
        const code = pre.querySelector('code');
        if (!code) continue;
        let header = pre.querySelector<HTMLElement>('.code-header');
        if (!header) {
          header = document.createElement('div');
          header.className = 'code-header';
          const language = document.createElement('span');
          language.textContent =
            Array.from(code.classList)
              .find((c) => c.startsWith('language-'))
              ?.slice(9) ?? '';
          const button = document.createElement('button');
          button.type = 'button';
          button.dataset['copyCode'] = '';
          header.append(language, button);
          pre.prepend(header);
        }
        header.querySelector('button')!.textContent = this.i18n.format('code-copy');
      }
    });
  }

  @HostListener('click', ['$event'])
  async copy(event: MouseEvent): Promise<void> {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
      'button[data-copy-code]',
    );
    if (!button || !this.element.contains(button)) return;
    const code = button.closest('pre')?.querySelector('code');
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code.textContent ?? '');
      button.textContent = this.i18n.format('code-copied');
    } catch {
      button.textContent = this.i18n.format('code-copy-error');
    }
    button.setAttribute('aria-live', 'polite');
  }
}
