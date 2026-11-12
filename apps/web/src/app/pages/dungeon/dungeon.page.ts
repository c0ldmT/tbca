import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import type { DungeonView } from '@tbca/shared';

import { ApiFailure } from '../../core/api-failure';
import { AuthService } from '../../core/auth.service';
import { CharacterService } from '../../core/character.service';
import { EconomyService } from '../../core/economy.service';
import { GameConfigService } from '../../core/game-config.service';
import { HudStatusService } from '../../core/hud-status.service';
import { SoundService } from '../../core/sound.service';
import { GlitchDirective } from '../../shared/glitch.directive';
import { LootReveal } from '../../shared/loot-reveal/loot-reveal';
import { Bar } from '../../shared/ui/bar';
import { ItemIcon } from '../../shared/ui/item-icon';
import { Segments } from '../../shared/ui/segments';
import { tier } from '../../shared/item-format';

/**
 * Dungeon: Run starten, Etage für Etage weiter oder mit dem Loot raus. Der Schacht links zeigt
 * die Tiefe, Boss-Etagen alle fünf Ebenen. Beim Ausstieg öffnet sich der Loot-Reveal.
 */
@Component({
  selector: 'tbca-dungeon-page',
  imports: [TranslocoDirective, RouterLink, GlitchDirective, Bar, Segments, ItemIcon, LootReveal],
  templateUrl: './dungeon.page.html',
  styleUrl: './dungeon.page.css',
})
export class DungeonPage {
  protected readonly auth = inject(AuthService);
  protected readonly characters = inject(CharacterService);
  private readonly economy = inject(EconomyService);
  private readonly gameConfig = inject(GameConfigService);
  private readonly hud = inject(HudStatusService);
  private readonly sound = inject(SoundService);
  private readonly transloco = inject(TranslocoService);

  protected readonly view = signal<DungeonView | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly injectors = signal(0);
  protected readonly backupChip = signal(false);
  protected readonly previousHp = signal<number | null>(null);
  protected readonly revealOpen = signal(false);

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

  /** Schacht: drei Etagen voraus (im Nebel), die nächste hervorgehoben, darunter die geschafften. */
  protected readonly floors = computed(() => {
    const r = this.run();
    if (!r) return [];
    const out: { floor: number; state: 'fog' | 'next' | 'done'; boss: boolean }[] = [];
    for (let f = r.floor + 3; f >= Math.max(1, r.floor - 8); f--) {
      out.push({
        floor: f,
        state: f === r.floor + 1 ? 'next' : f <= r.floor ? 'done' : 'fog',
        boss: f % 5 === 0,
      });
    }
    return out;
  });

  constructor() {
    void this.load();
  }

  protected pad(n: number): string {
    return n < 10 ? `0${n}` : String(n);
  }

  protected decideTime(iso: string): string {
    return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }

  protected tierOf(rarity: number): number {
    return tier(rarity);
  }

  protected outcomeTitle(): string {
    const r = this.run();
    return r ? this.transloco.translate('dungeon.outcome.' + r.status, { floor: r.floor }) : '';
  }

  protected async load(): Promise<void> {
    this.error.set(null);
    try {
      await this.gameConfig.load();
      if (this.auth.state() === undefined) await this.auth.refresh();
      if (!this.auth.user()) return;
      if (this.characters.state() === undefined) await this.characters.refresh();
      if (!this.characters.state()) return;
      this.setView(await this.economy.dungeon());
    } catch (error) {
      this.error.set(error instanceof ApiFailure ? error.code : 'unknown');
    }
  }

  protected start(): Promise<void> {
    return this.act(() =>
      this.economy.dungeonStart({ injectors: this.injectors(), backupChip: this.backupChip() }),
    );
  }

  protected async action(name: 'continue' | 'heal' | 'leave'): Promise<void> {
    this.sound.play('click');
    await this.act(() => this.economy.dungeonAction(name));
    const r = this.run();
    if (!r) return;
    if (r.status === 'defeated') this.sound.play('fail');
    else if (r.status !== 'active' && r.loot.items.length > 0) this.revealOpen.set(true);
    else if (name === 'continue' && r.status === 'active') this.sound.play('hit');
  }

  private setView(view: DungeonView): void {
    const before = this.view()?.run;
    this.previousHp.set(before && before.status === 'active' ? before.hp : null);
    this.view.set(view);
    this.hud.fromDungeon(view);
  }

  private async act(fn: () => Promise<DungeonView>): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      this.setView(await fn());
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
