import { Component, computed, inject, signal } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { CLASS_IDS, type ClassId } from '@tbca/game-core';

import { AuthService } from '../../core/auth.service';
import { ApiFailure, CharacterService } from '../../core/character.service';
import { GameConfigService } from '../../core/game-config.service';
import { AttributesPanel } from './attributes-panel';
import { CreateCharacter } from './create-character';
import { EquipmentPanel } from './equipment-panel';
import { LoadoutEditor } from './loadout-editor';

@Component({
  selector: 'tbca-character-page',
  imports: [TranslocoDirective, CreateCharacter, AttributesPanel, LoadoutEditor, EquipmentPanel],
  templateUrl: './character.page.html',
  styleUrl: './character.page.css',
})
export class CharacterPage {
  protected readonly auth = inject(AuthService);
  protected readonly characters = inject(CharacterService);
  protected readonly gameConfig = inject(GameConfigService);

  protected readonly classIds = CLASS_IDS;
  protected readonly loadError = signal<string | null>(null);
  protected readonly classError = signal<string | null>(null);
  protected readonly switching = signal(false);

  protected readonly config = computed(() => this.gameConfig.current()?.game ?? null);
  protected readonly testSeason = computed(() => this.gameConfig.current()?.season.isTest ?? false);
  protected readonly xpPercent = computed(() => {
    const c = this.characters.state();
    return c && c.xpToNext ? Math.min(100, (c.xpIntoLevel / c.xpToNext) * 100) : 100;
  });

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loadError.set(null);
    try {
      await this.gameConfig.load();
      if (this.auth.state() === undefined) await this.auth.refresh();
      if (this.auth.user()) await this.characters.refresh();
    } catch (error) {
      this.loadError.set(error instanceof ApiFailure ? error.code : 'unavailable');
    }
  }

  protected async switchClass(classId: ClassId): Promise<void> {
    this.switching.set(true);
    this.classError.set(null);
    try {
      await this.characters.switchClass(classId);
    } catch (error) {
      this.classError.set(error instanceof ApiFailure ? error.code : 'unknown');
    } finally {
      this.switching.set(false);
    }
  }
}
