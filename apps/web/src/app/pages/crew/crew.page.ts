import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';

import { AuthService } from '../../core/auth.service';
import { HubTabs, type HubTab } from '../../shared/ui/hub-tabs';

const TABS: HubTab[] = [
  { path: '/crew/team', label: 'crew.tabs.team' },
  { path: '/crew/challenge', label: 'crew.tabs.challenge' },
  { path: '/crew/league', label: 'crew.tabs.league' },
  { path: '/crew/communities', label: 'crew.tabs.communities' },
];

/** Crew-Hub: eigenes Team, Team-Kämpfe, Team-Liga und Communities. */
@Component({
  selector: 'tbca-crew-page',
  imports: [TranslocoDirective, RouterOutlet, HubTabs],
  template: `
    <div class="hub" *transloco="let t">
      <header class="tbca-hub-head">
        <span class="tbca-kicker">{{ t('crew.kicker') }}</span>
        <h1 class="tbca-title tbca-gl tbca-gl--e">{{ t('hubs.crew') }}</h1>
      </header>
      @if (auth.state() === null) {
        <section class="tbca-panel state">
          <a class="tbca-button" [href]="auth.loginUrl()">{{ t('auth.login') }}</a>
        </section>
      } @else {
        <tbca-hub-tabs [tabs]="tabs" [label]="t('hubs.crew')" />
        <router-outlet />
      }
    </div>
  `,
  styleUrl: '../character/character.page.css',
})
export class CrewPage {
  protected readonly auth = inject(AuthService);
  protected readonly tabs = TABS;

  constructor() {
    if (this.auth.state() === undefined) void this.auth.refresh();
  }
}
