import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';

import { AccountService } from '../../core/account.service';
import { ApiFailure } from '../../core/api-failure';
import { AuthService } from '../../core/auth.service';
import { CharacterService } from '../../core/character.service';
import { LanguageService } from '../../core/language.service';
import { PreferencesService, QUALITIES } from '../../core/preferences.service';

/** Konto: verknüpfte Plattformen, Sprache, Umbenennen, Datenexport und Löschen. */
@Component({
  selector: 'tbca-account-page',
  imports: [TranslocoDirective],
  templateUrl: './account.page.html',
  styleUrl: './account.page.css',
})
export class AccountPage {
  protected readonly auth = inject(AuthService);
  protected readonly characters = inject(CharacterService);
  protected readonly language = inject(LanguageService);
  protected readonly prefs = inject(PreferencesService);
  protected readonly qualities = QUALITIES;
  private readonly account = inject(AccountService);
  private readonly router = inject(Router);

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly newName = signal('');
  protected readonly confirmation = signal('');

  protected readonly renameLocked = computed(() => {
    const at = this.characters.state()?.rename.availableAt;
    return at && Date.parse(at) > Date.now() ? at : null;
  });

  constructor() {
    void (async () => {
      if (this.auth.state() === undefined) await this.auth.refresh();
      if (this.auth.user() && this.characters.state() === undefined)
        await this.characters.refresh().catch(() => undefined);
    })();
  }

  protected formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString(this.language.current());
  }

  protected setLocale(locale: 'de' | 'en'): Promise<void> {
    return this.run(async () => {
      await this.account.setLocale(locale);
      this.language.use(locale);
      await this.auth.refresh();
      this.notice.set('account.saved');
    });
  }

  protected rename(): Promise<void> {
    return this.run(async () => {
      await this.characters.rename(this.newName().trim());
      this.newName.set('');
      this.notice.set('account.renamed');
    });
  }

  protected export(): Promise<void> {
    return this.run(() => this.account.downloadExport());
  }

  protected remove(): Promise<void> {
    return this.run(async () => {
      await this.account.delete(this.confirmation());
      await this.router.navigateByUrl('/');
    });
  }

  private async run(fn: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      await fn();
    } catch (error) {
      this.error.set(error instanceof ApiFailure ? error.code : 'unknown');
    } finally {
      this.busy.set(false);
    }
  }
}
