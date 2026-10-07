import { Injectable, inject } from '@angular/core';
import { ApiService } from './api.service';
import { I18nService } from './i18n.service';
import { SessionStore } from './session.store';

@Injectable({ providedIn: 'root' })
export class StartupService {
  private api = inject(ApiService);
  private i18n = inject(I18nService);
  private session = inject(SessionStore);
  private pending?: Promise<void>;

  initialize(): Promise<void> {
    return (this.pending ??= this.load());
  }

  private async load(): Promise<void> {
    const [, bootstrap] = await Promise.all([this.i18n.init(), this.api.bootstrap()]);
    this.session.setHasAdmin(bootstrap.has_admin);
    this.session.setUser(bootstrap.user);
  }
}
