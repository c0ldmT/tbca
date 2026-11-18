import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import type { DungeonView } from '@tbca/shared';

import { ApiFailure } from '../../core/api-failure';
import { AuthService } from '../../core/auth.service';
import { CharacterService } from '../../core/character.service';
import { EconomyService } from '../../core/economy.service';
import { GameConfigService } from '../../core/game-config.service';
import { GlitchDirective } from '../../shared/glitch.directive';
import { ItemCard } from '../character/item-card';

/** Dungeon: Run starten, Etage für Etage weiter oder mit dem Loot raus. */
@Component({
  selector: 'tbca-dungeon-page',
  imports: [TranslocoDirective, RouterLink, ItemCard, GlitchDirective],
  templateUrl: './dungeon.page.html',
  styleUrl: './dungeon.page.css',
})
export class DungeonPage {
  protected readonly auth = inject(AuthService);
  protected readonly characters = inject(CharacterService);
  private readonly economy = inject(EconomyService);
  private readonly gameConfig = inject(GameConfigService);

  protected readonly view = signal<DungeonView | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly injectors = signal(0);
  protected readonly backupChip = signal(false);

  protected readonly run = computed(() => this.view()?.run ?? null);
  protected readonly active = computed(() => this.run()?.status === 'active');
  protected readonly ownedInjectors = computed(() => this.view()?.stacks['heal_injector'] ?? 0);
  protected readonly ownedChips = computed(() => this.view()?.stacks['backup_chip'] ?? 0);
  protected readonly injectorOptions = computed(() =>
    Array.from(
      { length: Math.min(this.view()?.maxInjectors ?? 0, this.ownedInjectors()) + 1 },
      (_, i) => i,
    ),
  );

  constructor() {
    void this.load();
  }

  protected percent(value: number, max: number): number {
    return max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  }

  protected decideTime(iso: string): string {
    return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }

  protected async load(): Promise<void> {
    this.error.set(null);
    try {
      await this.gameConfig.load();
      if (this.auth.state() === undefined) await this.auth.refresh();
      if (!this.auth.user()) return;
      if (this.characters.state() === undefined) await this.characters.refresh();
      if (!this.characters.state()) return;
      this.view.set(await this.economy.dungeon());
    } catch (error) {
      this.error.set(error instanceof ApiFailure ? error.code : 'unknown');
    }
  }

  protected start(): Promise<void> {
    return this.act(() =>
      this.economy.dungeonStart({ injectors: this.injectors(), backupChip: this.backupChip() }),
    );
  }

  protected action(name: 'continue' | 'heal' | 'leave'): Promise<void> {
    return this.act(() => this.economy.dungeonAction(name));
  }

  private async act(fn: () => Promise<DungeonView>): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      this.view.set(await fn());
      this.injectors.set(0);
      this.backupChip.set(false);
      void this.characters.refresh();
    } catch (error) {
      this.error.set(error instanceof ApiFailure ? error.code : 'unknown');
    } finally {
      this.busy.set(false);
    }
  }
}
