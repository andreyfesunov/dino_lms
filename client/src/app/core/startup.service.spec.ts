import { TestBed } from '@angular/core/testing';
import { ApiService } from './api.service';
import { I18nService } from './i18n.service';
import { SessionStore } from './session.store';
import { StartupService } from './startup.service';

describe('StartupService', () => {
  function configure(bootstrap: () => Promise<unknown>, init = () => Promise.resolve()) {
    TestBed.configureTestingModule({
      providers: [
        { provide: ApiService, useValue: { bootstrap } },
        { provide: I18nService, useValue: { init } },
      ],
    });
    return { startup: TestBed.inject(StartupService), session: TestBed.inject(SessionStore) };
  }

  it('waits for bootstrap and shares a single initialization', async () => {
    let resolve!: (value: unknown) => void;
    const bootstrap = vi.fn(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const { startup, session } = configure(bootstrap);
    const pending = startup.initialize();
    expect(startup.initialize()).toBe(pending);
    expect(session.ready()).toBe(false);
    resolve({ has_admin: true, user: null });
    await pending;
    expect(bootstrap).toHaveBeenCalledTimes(1);
    expect(session.ready()).toBe(true);
    expect(session.hasAdmin()).toBe(true);
    expect(session.signedIn()).toBe(false);
  });

  it('does not turn a network failure into a fresh database', async () => {
    const { startup, session } = configure(() => Promise.reject(new Error('offline')));
    session.setHasAdmin(true);
    await expect(startup.initialize()).rejects.toThrow('offline');
    expect(session.ready()).toBe(false);
    expect(session.hasAdmin()).toBe(true);
  });

  it('does not release navigation before translations load', async () => {
    let finish!: () => void;
    const { startup, session } = configure(
      async () => ({ has_admin: false, user: null }),
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const pending = startup.initialize();
    await Promise.resolve();
    expect(session.ready()).toBe(false);
    finish();
    await pending;
    expect(session.ready()).toBe(true);
    expect(session.hasAdmin()).toBe(false);
  });
});
