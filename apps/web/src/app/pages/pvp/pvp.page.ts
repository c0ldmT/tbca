import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { CLASS_IDS, type ClassId } from '@tbca/game-core';
import type { FightSummary, OpponentView, PvpStatus } from '@tbca/shared';

import { ApiFailure } from '../../core/api-failure';
import { AuthService } from '../../core/auth.service';
import { CharacterService } from '../../core/character.service';
import { PvpService } from '../../core/pvp.service';

/** Arena: Gegner suchen, gewertet oder freundschaftlich herausfordern, letzte Kämpfe. */
@Component({
  selector: 'tbca-pvp-page',
  imports: [TranslocoDirective, RouterLink],
  templateUrl: './pvp.page.html',
  styleUrl: './pvp.page.css',
})
export class PvpPage {
  protected readonly auth = inject(AuthService);
  protected readonly characters = inject(CharacterService);
  private readonly pvp = inject(PvpService);
  private readonly router = inject(Router);

  protected readonly status = signal<PvpStatus | null>(null);
  protected readonly opponents = signal<OpponentView[] | null>(null);
  protected readonly recent = signal<FightSummary[]>([]);
  protected readonly query = signal('');
  protected readonly busy = signal<string | null>(null);
  protected readonly classIds = CLASS_IDS;
  protected readonly trainingClass = signal<ClassId>('bruiser');
  protected readonly trainingLevel = signal(1);
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
      // Trainingsgegner standardmäßig auf dem eigenen Level.
      this.trainingLevel.set(this.characters.state()?.level ?? 1);
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

  protected setTrainingLevel(raw: string): void {
    const level = Math.round(Number(raw));
    this.trainingLevel.set(Number.isFinite(level) ? Math.min(100, Math.max(1, level)) : 1);
  }

  /** Trainingskampf gegen einen Computer-Gegner; ohne Belohnung, zum Testen von Build und Taktik. */
  protected async train(): Promise<void> {
    this.busy.set('training');
    this.error.set(null);
    try {
      const result = await this.pvp.training({
        classId: this.trainingClass(),
        level: this.trainingLevel(),
      });
      await this.router.navigate(['/replay', result.fightId], { state: { result } });
    } catch (error) {
      this.error.set(error instanceof ApiFailure ? error.code : 'unknown');
    } finally {
      this.busy.set(null);
    }
  }

  protected async challenge(opponent: OpponentView, mode: 'rated' | 'friendly'): Promise<void> {
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
