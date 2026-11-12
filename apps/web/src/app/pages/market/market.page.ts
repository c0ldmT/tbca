import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';

import { AuthService } from '../../core/auth.service';
import { HubTabs, type HubTab } from '../../shared/ui/hub-tabs';

const TABS: HubTab[] = [{ path: '/market/shop', label: 'market.tabs.shop' }];

/** Markt-Hub: Shop; Handel folgt mit handelbaren Items. */
@Component({
  selector: 'tbca-market-page',
  imports: [TranslocoDirective, RouterOutlet, HubTabs],
  template: `
    <div class="hub" *transloco="let t">
      <header>
        <span class="tbca-kicker">{{ t('market.kicker') }}</span>
        <h1 class="tbca-title tbca-gl tbca-gl--e">{{ t('hubs.market') }}</h1>
      </header>
      @if (auth.state() === null) {
        <section class="tbca-panel state">
          <a class="tbca-button" [href]="auth.loginUrl()">{{ t('auth.login') }}</a>
        </section>
      } @else {
        <tbca-hub-tabs [tabs]="tabs" [label]="t('hubs.market')" />
        <router-outlet />
      }
    </div>
  `,
  styleUrl: '../character/character.page.css',
})
export class MarketPage {
  protected readonly auth = inject(AuthService);
  protected readonly tabs = TABS;

  constructor() {
    if (this.auth.state() === undefined) void this.auth.refresh();
  }
}
