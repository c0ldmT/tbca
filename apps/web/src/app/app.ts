import { Component, effect, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import type { Locale } from '@tbca/shared/constants';

import { AccountService } from './core/account.service';
import { AuthService } from './core/auth.service';
import { LanguageService } from './core/language.service';

@Component({
  selector: 'tbca-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TranslocoDirective],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly auth = inject(AuthService);
  protected readonly language = inject(LanguageService);
  private readonly account = inject(AccountService);

  constructor() {
    void this.auth.refresh();
    // Die im Konto gespeicherte Sprache gilt auf jedem Gerät, sobald man angemeldet ist.
    effect(() => {
      const locale = this.auth.user()?.account.locale;
      if (locale) this.language.use(locale);
    });
  }

  /** Sprachwahl im Kopf; angemeldet wird sie auch im Konto gespeichert. */
  protected setLanguage(locale: Locale): void {
    this.language.use(locale);
    if (this.auth.user()) {
      void this.account
        .setLocale(locale)
        .then(() => this.auth.refresh())
        .catch(() => undefined);
    }
  }
}
