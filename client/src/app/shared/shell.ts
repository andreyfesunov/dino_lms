import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SessionStore } from '../core/session.store';
import { Sidebar } from './sidebar';

@Component({
  selector: 'app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, Sidebar],
  template: `
    @if (showShell()) {
      <div class="flex min-h-screen gap-4 p-4 pb-24 md:pb-4">
        <app-sidebar class="contents md:block" />
        <main class="min-w-0 flex-1">
          <router-outlet />
        </main>
      </div>
    } @else {
      <router-outlet />
    }
  `,
})
export class Shell {
  readonly session = inject(SessionStore);

  showShell(): boolean {
    const s = this.session;
    return s.ready() && s.signedIn() && !s.needsOnboarding();
  }
}
