import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';

import { AuthService } from '../../core/auth.service';
import { ApiFailure, CharacterService } from '../../core/character.service';
import { GameConfigService } from '../../core/game-config.service';
import { HubTabs, type HubTab } from '../../shared/ui/hub-tabs';
import { CharacterHead } from './character-head';
import { CreateCharacter } from './create-character';
import { GearState } from './gear/gear-state';

export const WRENCH_ICON = 'M14 6l4 4 M4 20l9-9 M13 5l3-3 5 5-3 3z';

const TABS: HubTab[] = [
  { path: '/character/gear', label: 'character.tabs.gear' },
  { path: '/character/workshop', label: 'character.tabs.workshop', icon: WRENCH_ICON },
  { path: '/character/loadout', label: 'character.tabs.loadout' },
  { path: '/character/build', label: 'character.tabs.build' },
];

/**
 * Charakter-Hub: Kopf mit Kampfwerten, darunter Ausrüstung, Werkstatt, Fähigkeiten & Taktik
 * sowie Attribute & Klasse als Tabs. Ohne Charakter erscheint das Erstellen.
 */
@Component({
  selector: 'tbca-character-page',
  imports: [TranslocoDirective, RouterOutlet, CreateCharacter, CharacterHead, HubTabs],
  providers: [GearState],
  templateUrl: './character.page.html',
  styleUrl: './character.page.css',
})
export class CharacterPage {
  protected readonly auth = inject(AuthService);
  protected readonly characters = inject(CharacterService);
  protected readonly gameConfig = inject(GameConfigService);
  protected readonly gear = inject(GearState);

  protected readonly tabs = TABS;
  protected readonly loadError = signal<string | null>(null);
  protected readonly config = computed(() => this.gameConfig.current()?.game ?? null);

  constructor() {
    void this.load();
    // Neuer Charakter oder Klassenwechsel: Inventar (neu) laden.
    effect(() => {
      const id = this.characters.state()?.id;
      const cls = this.characters.state()?.classId;
      if (id && cls) untracked(() => void this.gear.load());
    });
  }

  protected async load(): Promise<void> {
    this.loadError.set(null);
    try {
      await this.gameConfig.load();
      if (this.auth.state() === undefined) await this.auth.refresh();
      if (this.auth.user() && this.characters.state() === undefined)
        await this.characters.refresh();
    } catch (error) {
      this.loadError.set(error instanceof ApiFailure ? error.code : 'unavailable');
    }
  }
}
