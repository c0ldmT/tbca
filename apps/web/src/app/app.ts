import { Component, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import type { Locale } from '@tbca/shared/constants';

import { AuthService } from './core/auth.service';
import { LanguageService } from './core/language.service';

@Component({
  selector: 'tbca-root',
  imports: [RouterOutlet, RouterLink, TranslocoDirective],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly auth = inject(AuthService);
  protected readonly language = inject(LanguageService);

  constructor() {
    void this.auth.refresh();
  }

  protected setLanguage(locale: Locale): void {
    this.language.use(locale);
  }
}
