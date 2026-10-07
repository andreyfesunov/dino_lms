import { Injectable, signal } from '@angular/core';
import { FluentBundle, FluentResource, FluentVariable } from '@fluent/bundle';
import { negotiateLanguages } from '@fluent/langneg';

export type Locale = 'en' | 'ru';

const LOCALES: Locale[] = ['en', 'ru'];
const COOKIE_NAME = 'lang';

function parseCookie(name: string): string | null {
  const found = document.cookie
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(name + '='));
  return found ? decodeURIComponent(found.slice(name.length + 1)) : null;
}

@Injectable({ providedIn: 'root' })
export class I18nService {
  readonly locale = signal<Locale>('en');
  private bundles = new Map<Locale, FluentBundle>();
  private loaded = false;

  async init(): Promise<void> {
    if (this.loaded) {
      return;
    }
    await Promise.all(LOCALES.map((l) => this.loadLocale(l)));
    this.loaded = true;

    const cookie = parseCookie(COOKIE_NAME);
    const negotiated = negotiateLanguages(cookie ? [cookie] : [navigator.language], LOCALES, {
      defaultLocale: 'en',
    });
    this.locale.set((negotiated[0] as Locale) ?? 'en');
  }

  setLocale(locale: Locale): void {
    this.locale.set(locale);
    document.cookie = `${COOKIE_NAME}=${locale}; path=/; max-age=${3600 * 24 * 365}; samesite=lax`;
  }

  format(key: string, args?: Record<string, unknown>): string {
    const bundle = this.bundles.get(this.locale());
    if (!bundle) {
      return key;
    }
    const message = bundle.getMessage(key);
    if (!message?.value) {
      return key;
    }
    const errors: Error[] = [];
    const pattern = bundle.formatPattern(
      message.value,
      (args ?? {}) as Record<string, FluentVariable>,
      errors,
    );
    return errors.length ? String(message.value) : pattern;
  }

  formatPattern(key: string, args: Record<string, unknown>): string {
    return this.format(key, args);
  }

  private async loadLocale(locale: Locale): Promise<void> {
    const response = await fetch(`/locales/${locale}.ftl`, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) {
      throw new Error(`Unable to load locale ${locale}: ${response.status}`);
    }
    const text = await response.text();
    const bundle = new FluentBundle(locale, { useIsolating: false });
    const errors = bundle.addResource(new FluentResource(text));
    if (errors.length) {
      throw new Error(`Invalid locale ${locale}: ${errors.join(', ')}`);
    }
    this.bundles.set(locale, bundle);
  }
}
