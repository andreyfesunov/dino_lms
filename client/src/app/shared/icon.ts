import { ChangeDetectionStrategy, Component, input } from '@angular/core';

type IconName =
  | 'arrow-left'
  | 'arrow-right'
  | 'plus'
  | 'layers'
  | 'folder'
  | 'users'
  | 'user-cog'
  | 'settings'
  | 'log-out'
  | 'user'
  | 'search'
  | 'pencil'
  | 'x'
  | 'lock'
  | 'key'
  | 'copy'
  | 'more-horizontal'
  | 'trash'
  | 'graduation-cap'
  | 'book-open'
  | 'chevron-right'
  | 'check-circle'
  | 'unlock'
  | 'clock'
  | 'file-text'
  | 'play'
  | 'circle-play'
  | 'external-link'
  | 'user-plus';

const PATHS: Record<IconName, string[]> = {
  'arrow-left': ['m12 19-7-7 7-7', 'M19 12H5'],
  'arrow-right': ['M5 12h14', 'm12 5 7 7-7 7'],
  plus: ['M5 12h14', 'M12 5v14'],
  layers: [
    'm12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z',
    'm22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65',
    'm22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65',
  ],
  folder: [
    'M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z',
  ],
  users: [
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2',
    'M9 7a4 4 0 1 0 0 0.001',
    'M22 21v-2a4 4 0 0 0-3-3.87',
    'M16 3.13a4 4 0 0 1 0 7.75',
  ],
  'user-cog': [
    'M18 15a3 3 0 1 0 0.001 0',
    'M9 3a4 4 0 1 0 0.001 0',
    'M10 15H6a4 4 0 0 0-4 4v2',
    'm21.7 16.4-.9-.3',
    'm15.2 13.9-.9-.3',
    'm16.6 18.7.3-.9',
    'm19.1 12.2.3-.9',
    'm19.6 18.7-.4-1',
    'm16.8 12.3-.4-1',
    'm14.3 16.6 1-.4',
    'm20.7 13.8 1-.4',
  ],
  settings: [
    'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z',
    'M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  ],
  'log-out': ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'M16 17l5-5-5-5', 'M21 12H9'],
  user: ['M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2', 'M12 3a4 4 0 1 0 0.001 0'],
  search: ['M19 11a8 8 0 1 0-16 0 8 8 0 0 0 16 0z', 'm21 21-4.3-4.3'],
  pencil: [
    'M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z',
    'm15 5 4 4',
  ],
  x: ['M18 6 6 18', 'm6 6 12 12'],
  lock: [
    'M6 22a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2z',
    'M7 11V7a5 5 0 0 1 10 0v4',
  ],
  key: [
    'm15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4',
    'm21 2-9.6 9.6',
    'M13 15.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z',
  ],
  copy: [
    'M22 10a2 2 0 0 0-2-2h-10a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2z',
    'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2',
  ],
  'more-horizontal': [
    'M13 12a1 1 0 1 0-2 0 1 1 0 0 0 2 0z',
    'M20 12a1 1 0 1 0-2 0 1 1 0 0 0 2 0z',
    'M6 12a1 1 0 1 0-2 0 1 1 0 0 0 2 0z',
  ],
  trash: [
    'M3 6h18',
    'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6',
    'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2',
    'M10 11v6',
    'M14 11v6',
  ],
  'graduation-cap': [
    'M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z',
    'M22 10v6',
    'M6 12.5V16a6 3 0 0 0 12 0v-3.5',
  ],
  'book-open': [
    'M12 7v14',
    'M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z',
  ],
  'chevron-right': ['m9 18 6-6-6-6'],
  'check-circle': ['M22 12a10 10 0 1 0-20 0 10 10 0 0 0 20 0z', 'm9 12 2 2 4-4'],
  unlock: [
    'M6 22a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2z',
    'M7 11V7a5 5 0 0 1 9.9-1',
  ],
  clock: ['M22 12a10 10 0 1 0-20 0 10 10 0 0 0 20 0z', 'M12 6v6l4 2'],
  'file-text': [
    'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z',
    'M14 2v4a2 2 0 0 0 2 2h4',
    'M10 9H8',
    'M16 13H8',
    'M16 17H8',
  ],
  play: ['M8 5.14v14l11-7-11-7z'],
  'circle-play': ['M22 12a10 10 0 1 0-20 0 10 10 0 0 0 20 0z', 'M10 8l6 4-6 4V8z'],
  'external-link': [
    'M15 3h6v6',
    'M10 14 21 3',
    'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6',
  ],
  'user-plus': [
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2',
    'M9 3a4 4 0 1 0 0.001 0',
    'M19 8v6',
    'M22 11h-6',
  ],
};

@Component({
  selector: 'app-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: contents;
    }
    svg {
      height: 18px;
      width: 18px;
      flex-shrink: 0;
    }
  `,
  template: `
    <svg
      [class]="cls()"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      @for (d of paths(); track $index) {
        <path [attr.d]="d" />
      }
    </svg>
  `,
})
export class Icon {
  readonly name = input.required<IconName>();
  readonly extra = input('');

  paths(): string[] {
    return PATHS[this.name()] ?? [];
  }

  cls(): string {
    return this.extra();
  }
}
