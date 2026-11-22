import { Global, Inject, Injectable, Module, type OnModuleDestroy } from '@nestjs/common';
import type { DbConnection } from '@tbca/db';
import { GameClock, systemTimeSource, type Clock } from '@tbca/game-core';

import {
  DrizzleSeasonRepository,
  type CurrentSeason,
  type SeasonRepository,
} from '../game/season.js';
import { CLOCK, DB_CONNECTION } from '../tokens.js';

const REFRESH_MS = 5_000;

/**
 * Spieluhr der laufenden Season (Spezifikation, Abschnitt 14). Zeitfaktor und Vorspul-Stand
 * liegen in der Datenbank, damit alle Prozesse dieselbe Spielzeit sehen; jeder Prozess liest sie
 * alle paar Sekunden neu. Ohne Anker läuft die Spielzeit gleich der Echtzeit.
 */
@Injectable()
export class SeasonClock implements Clock, OnModuleDestroy {
  private clock = new GameClock();
  private readonly timer: ReturnType<typeof setInterval>;
  private readonly repo: SeasonRepository;

  constructor(@Inject(DB_CONNECTION) conn: DbConnection) {
    this.repo = new DrizzleSeasonRepository(conn.db);
    this.timer = setInterval(() => void this.refresh().catch(() => undefined), REFRESH_MS);
    this.timer.unref();
    void this.refresh().catch(() => undefined);
  }

  now(): number {
    return this.clock.now();
  }

  getFactor(): number {
    return this.clock.getFactor();
  }

  /** Liest Zeitfaktor und Anker neu, z. B. direkt nach einer Änderung im Admin-Bereich. */
  async refresh(): Promise<void> {
    const current = await this.repo.findCurrent();
    if (current) this.apply(current.clock);
  }

  apply(clock: CurrentSeason['clock']): void {
    const real = systemTimeSource();
    const start =
      clock.anchorReal && clock.anchorGame
        ? clock.anchorGame.getTime() +
          Math.floor((real - clock.anchorReal.getTime()) * clock.factor)
        : real;
    this.clock = new GameClock({ factor: clock.factor, start });
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }
}

@Global()
@Module({
  providers: [{ provide: CLOCK, useClass: SeasonClock }],
  exports: [CLOCK],
})
export class ClockModule {}
