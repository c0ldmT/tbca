import { DOCUMENT } from '@angular/common';
import { Component, ElementRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import type { Locale } from '@tbca/shared/constants';
import { filter } from 'rxjs';

import { AccountService } from './core/account.service';
import { AuthService } from './core/auth.service';
import { CharacterService } from './core/character.service';
import { HudStatusService } from './core/hud-status.service';
import { LanguageService } from './core/language.service';
import { LegalService } from './core/legal.service';
import { PreferencesService, QUALITIES, type Quality } from './core/preferences.service';
import { SoundService } from './core/sound.service';
import { pathOnly, soundForClick } from './core/ui-sounds';
import { playNavMotion, tabDirection, transitionKind } from './core/nav-motion';
import { CityRain } from './shared/city-rain/city-rain';
import { HUBS } from './shared/hubs';
import { SlideIndicator } from './shared/slide-indicator';
import { BgStatus } from './shared/ui/bg-status';

@Component({
  selector: 'tbca-root',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    TranslocoDirective,
    CityRain,
    SlideIndicator,
    BgStatus,
  ],
  templateUrl: './app.html',
  styleUrl: './app.css',
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'menuOpen.set(false)',
  },
})
export class App {
  protected readonly auth = inject(AuthService);
  protected readonly language = inject(LanguageService);
  protected readonly characters = inject(CharacterService);
  protected readonly hud = inject(HudStatusService);
  protected readonly prefs = inject(PreferencesService);
  private readonly sound = inject(SoundService);
  private readonly account = inject(AccountService);
  protected readonly legal = inject(LegalService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly document = inject(DOCUMENT);
  private motionTimer: number | undefined;

  protected readonly hubs = HUBS;
  protected readonly qualities = QUALITIES;
  protected readonly menuOpen = signal(false);
  protected readonly initials = computed(() => {
    const name = this.characters.state()?.name ?? this.auth.displayName() ?? '?';
    return (
      name
        .replace(/[^\p{L}\p{N}]/gu, '')
        .slice(0, 2)
        .toUpperCase() || '?'
    );
  });

  constructor() {
    void this.auth.refresh();
    void this.legal.load();
    // Die im Konto gespeicherte Sprache gilt auf jedem Gerät, sobald man angemeldet ist.
    effect(() => {
      const locale = this.auth.user()?.account.locale;
      if (locale) this.language.use(locale);
    });
    // Angemeldet: Charakter und Dungeon-Stand für die Kopfleiste laden.
    effect(() => {
      const user = this.auth.user();
      untracked(() => {
        if (!user) {
          this.hud.clear();
          return;
        }
        if (this.characters.state() === undefined)
          void this.characters.refresh().catch(() => undefined);
      });
    });
    effect(() => {
      if (this.characters.state()) untracked(() => void this.hud.refresh());
    });
    // Seitenwechsel schließen das Menü, klingen und starten die Bewegung (motion.css):
    // Hub-Wechsel voller, Tab-Wechsel leiser
    let previous: string | null = null;
    inject(Router)
      .events.pipe(filter((e) => e instanceof NavigationEnd))
      .subscribe((e) => {
        this.menuOpen.set(false);
        const path = pathOnly(e.urlAfterRedirects);
        if (previous !== null && previous !== path) {
          const kind = transitionKind(previous, path);
          const tabs = Array.from(this.document.querySelectorAll('a.tbca-tab'), (a) =>
            a.getAttribute('href'),
          );
          const view = this.document.defaultView;
          if (view) {
            this.motionTimer = playNavMotion(
              this.document.documentElement,
              kind,
              tabDirection(tabs, previous, path),
              view,
              this.motionTimer,
            );
          }
          this.sound.play(kind === 'hub' ? 'nav' : 'tab');
        }
        previous = path;
      });
  }

  protected toggleMenu(): void {
    this.sound.play(this.menuOpen() ? 'close' : 'open');
    this.menuOpen.update((open) => !open);
  }

  /** Leiser Klang für jede Schaltfläche, außerdem schließt ein Klick daneben das Menü. */
  protected onDocumentClick(event: Event): void {
    const id = soundForClick(event.target);
    if (id) this.sound.play(id);
    this.closeMenuOutside(event);
  }

  protected closeMenuOutside(event: Event): void {
    if (!this.menuOpen()) return;
    const menu = this.host.querySelector('.profile');
    if (menu && event.target instanceof Node && !menu.contains(event.target))
      this.menuOpen.set(false);
  }

  /** Sprachwahl im Profil-Menü; angemeldet wird sie auch im Konto gespeichert. */
  protected setLanguage(locale: Locale): void {
    this.language.use(locale);
    if (this.auth.user()) {
      void this.account
        .setLocale(locale)
        .then(() => this.auth.refresh())
        .catch(() => undefined);
    }
  }

  protected setQuality(quality: Quality): void {
    this.prefs.setQuality(quality);
  }

  protected setSound(on: boolean): void {
    this.prefs.setSound(on);
    if (on) this.sound.play('toggle');
  }

  protected async logout(): Promise<void> {
    this.menuOpen.set(false);
    await this.auth.logout().catch(() => undefined);
    this.characters.state.set(undefined);
  }
}
