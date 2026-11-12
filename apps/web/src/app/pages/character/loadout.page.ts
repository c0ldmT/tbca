import { Component, computed, inject } from '@angular/core';

import { CharacterService } from '../../core/character.service';
import { GameConfigService } from '../../core/game-config.service';
import { LoadoutEditor } from './loadout-editor';

/** Tab „Fähigkeiten & Taktik“. */
@Component({
  selector: 'tbca-loadout-page',
  imports: [LoadoutEditor],
  template: `
    @if (character(); as c) {
      @if (config(); as game) {
        <tbca-loadout-editor [character]="c" [config]="game" />
      }
    }
  `,
})
export class LoadoutPage {
  protected readonly character = inject(CharacterService).state;
  private readonly gameConfig = inject(GameConfigService);
  protected readonly config = computed(() => this.gameConfig.current()?.game ?? null);
}
