import { DOCUMENT } from '@angular/common';
import { Injectable, inject, signal } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { DEFAULT_LOCALE, LOCALES, type Locale } from '@tbca/shared/constants';

const STORAGE_KEY = 'tbca.locale';

/** Sprachwahl: gespeicherte Wahl, sonst Browsersprache, sonst Deutsch. */
@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly transloco = inject(TranslocoService);
  private readonly document = inject(DOCUMENT);

  readonly locales = LOCALES;
  readonly current = signal<Locale>(DEFAULT_LOCALE);

  init(): void {
    this.use(this.stored() ?? this.fromBrowser() ?? DEFAULT_LOCALE, false);
  }

  use(locale: Locale, persist = true): void {
    this.current.set(locale);
    this.transloco.setActiveLang(locale);
    this.document.documentElement.lang = locale;
    if (persist) {
      try {
        this.document.defaultView?.localStorage.setItem(STORAGE_KEY, locale);
      } catch {
        // Speicher nicht verfügbar (z. B. privater Modus) – Wahl gilt nur für diese Sitzung.
      }
    }
  }

  private stored(): Locale | null {
    try {
      return asLocale(this.document.defaultView?.localStorage.getItem(STORAGE_KEY));
    } catch {
      return null;
    }
  }

  private fromBrowser(): Locale | null {
    return asLocale(this.document.defaultView?.navigator.language.slice(0, 2));
  }
}

function asLocale(value: string | null | undefined): Locale | null {
  return LOCALES.find((l) => l === value) ?? null;
}
