import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import type { FightSummary, OpponentView, PvpStatus } from '@tbca/shared';

import { ApiFailure } from '../../core/api-failure';
import { AuthService } from '../../core/auth.service';
import { CharacterService } from '../../core/character.service';
import { HudStatusService } from '../../core/hud-status.service';
import { PvpService } from '../../core/pvp.service';
import { SoundService } from '../../core/sound.service';
import { ClassBadge } from '../../shared/ui/class-badge';
import { Segments } from '../../shared/ui/segments';
import { FightRow } from './fight-row';

/** Arena: Gegner suchen, gewertet oder freundschaftlich herausfordern; Tagesstand und letzte Kämpfe. */
@Component({
  selector: 'tbca-pvp-page',
  imports: [TranslocoDirective, RouterLink, ClassBadge, Segments, FightRow],
  templateUrl: './pvp.page.html',
  styleUrl: './pvp.page.css',
})
export class PvpPage {
  protected readonly auth = inject(AuthService);
  protected readonly characters = inject(CharacterService);
  protected readonly hud = inject(HudStatusService);
  private readonly pvp = inject(PvpService);
  private readonly router = inject(Router);
  private readonly sound = inject(SoundService);

  protected readonly status = signal<PvpStatus | null>(null);
  protected readonly opponents = signal<OpponentView[] | null>(null);
  protected readonly recent = signal<FightSummary[]>([]);
  protected readonly query = signal('');
  protected readonly busy = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  private searchTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.error.set(null);
    try {
      if (this.auth.state() === undefined) await this.auth.refresh();
      if (!this.auth.user()) return;
      if (this.characters.state() === undefined) await this.characters.refresh();
      if (!this.characters.state()) return;
      const [status, opponents, recent] = await Promise.all([
        this.pvp.status(),
        this.pvp.opponents(this.query()),
        this.pvp.recent(),
      ]);
      this.status.set(status);
      this.opponents.set(opponents);
      this.recent.set(recent);
    } catch (error) {
      this.error.set(error instanceof ApiFailure ? error.code : 'unknown');
    }
  }

  protected search(value: string): void {
    this.query.set(value);
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(async () => {
      try {
        this.opponents.set(await this.pvp.opponents(value));
      } catch (error) {
        this.error.set(error instanceof ApiFailure ? error.code : 'unknown');
      }
    }, 250);
  }

  protected async challenge(opponent: OpponentView, mode: 'rated' | 'friendly'): Promise<void> {
    this.sound.play('click');
    this.busy.set(`${opponent.id}:${mode}`);
    this.error.set(null);
    try {
      const result = await this.pvp.challenge({ opponentId: opponent.id, mode });
      // Charakter (XP, Level) im Hintergrund aktualisieren.
      void this.characters.refresh().catch(() => undefined);
      await this.router.navigate(['/replay', result.fightId], { state: { result } });
    } catch (error) {
      this.error.set(error instanceof ApiFailure ? error.code : 'unknown');
    } finally {
      this.busy.set(null);
    }
  }
}
