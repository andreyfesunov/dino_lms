import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-dino-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <img src="dino-mark.svg" alt="" class="inline-block shrink-0" [class]="sizeClass()" />
  `,
})
export class DinoLogo {
  readonly sizeClass = input('h-12 w-12');
}
