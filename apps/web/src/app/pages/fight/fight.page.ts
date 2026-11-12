import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';

import { AuthService } from '../../core/auth.service';
import { CharacterService } from '../../core/character.service';
import { HudStatusService } from '../../core/hud-status.service';
import { HubTabs, type HubTab } from '../../shared/ui/hub-tabs';

/** Kampf-Hub: Arena, Dungeon, Training und Verlauf. */
@Component({
  selector: 'tbca-fight-page',
  imports: [TranslocoDirective, RouterOutlet, RouterLink, HubTabs],
  template: `
    <div class="hub" *transloco="let t">
      <header class="title">
        <div>
          @if (characters.state(); as c) {
            <span class="tbca-kicker">
              {{ c.name }} · {{ t('classes.' + c.classId) }} · LV {{ c.level }}
            </span>
          }
          <h1 class="tbca-title tbca-gl tbca-gl--e">{{ t('hubs.fight') }}</h1>
        </div>
      </header>
      @if (auth.state() === null) {
        <section class="tbca-panel state">
          <p>{{ t('pvp.loginFirst') }}</p>
          <a class="tbca-button" [href]="auth.loginUrl()">{{ t('auth.login') }}</a>
        </section>
      } @else if (characters.state() === null) {
        <section class="tbca-panel state">
          <p>{{ t('pvp.characterFirst') }}</p>
          <a class="tbca-button" routerLink="/character">{{ t('character.create.title') }}</a>
        </section>
      } @else {
        <tbca-hub-tabs [tabs]="tabs()" [label]="t('hubs.fight')" />
        <router-outlet />
      }
    </div>
  `,
  styleUrl: '../character/character.page.css',
})
export class FightPage {
  protected readonly auth = inject(AuthService);
  protected readonly characters = inject(CharacterService);
  private readonly hud = inject(HudStatusService);

  protected readonly tabs = computed<HubTab[]>(() => [
    { path: '/fight/arena', label: 'fight.tabs.arena' },
    {
      path: '/fight/dungeon',
      label: 'fight.tabs.dungeon',
      badge: this.hud.runActive() ? 'LIVE' : null,
    },
    { path: '/fight/training', label: 'fight.tabs.training' },
    { path: '/fight/history', label: 'fight.tabs.history' },
  ]);

  constructor() {
    if (this.auth.state() === undefined) void this.auth.refresh();
  }
}
