import { Global, Module } from '@nestjs/common';
import { GameClock } from '@tbca/game-core';

import { CLOCK } from '../tokens.js';

/**
 * Stellt die Spieluhr bereit. Alle Spielabläufe lesen die Zeit hier (Spezifikation,
 * Abschnitt 14); Zeitfaktor und Vorspulen für Test-Seasons folgen in Phase 1.
 * Technische Zeiten wie der Ablauf von Sessions nutzen bewusst die Echtzeit.
 */
@Global()
@Module({
  providers: [{ provide: CLOCK, useFactory: () => new GameClock() }],
  exports: [CLOCK],
})
export class ClockModule {}
