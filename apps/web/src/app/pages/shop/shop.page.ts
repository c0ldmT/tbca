import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { CONSUMABLES } from '@tbca/game-core';
import type { ShopView } from '@tbca/shared';

import { ApiFailure } from '../../core/api-failure';
import { AuthService } from '../../core/auth.service';
import { CharacterService } from '../../core/character.service';
import { EconomyService } from '../../core/economy.service';
import { GameConfigService } from '../../core/game-config.service';
import { statLabel, statValue, tier } from '../../shared/item-format';
import { ItemIcon } from '../../shared/ui/item-icon';
import { Stars } from '../../shared/ui/stars';

/** Shop (Markt): Verbrauchsgüter und tägliche Rotation an Ausrüstung auf dem eigenen Level. */
@Component({
  selector: 'tbca-shop-page',
  imports: [TranslocoDirective, RouterLink, ItemIcon, Stars],
  templateUrl: './shop.page.html',
  styleUrl: './shop.page.css',
})
export class ShopPage {
  protected readonly auth = inject(AuthService);
  protected readonly characters = inject(CharacterService);
  private readonly economy = inject(EconomyService);
  private readonly gameConfig = inject(GameConfigService);

  protected readonly consumables = CONSUMABLES;
  protected readonly shop = signal<ShopView | null>(null);
  protected readonly busy = signal(false);
  protected readonly label = statLabel;
  protected readonly value = statValue;
  protected readonly tierOf = tier;
  protected readonly error = signal<string | null>(null);

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.error.set(null);
    try {
      await this.gameConfig.load();
      if (this.auth.state() === undefined) await this.auth.refresh();
      if (!this.auth.user()) return;
      if (this.characters.state() === undefined) await this.characters.refresh();
      if (!this.characters.state()) return;
      this.shop.set(await this.economy.shop());
    } catch (error) {
      this.error.set(error instanceof ApiFailure ? error.code : 'unknown');
    }
  }

  protected async buy(offerId: string): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      this.shop.set(await this.economy.buy(offerId));
      void this.characters.refresh();
    } catch (error) {
      this.error.set(error instanceof ApiFailure ? error.code : 'unknown');
    } finally {
      this.busy.set(false);
    }
  }
}
