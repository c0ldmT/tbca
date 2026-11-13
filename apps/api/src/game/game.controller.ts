import { Controller, Get, Inject } from '@nestjs/common';
import type { GameConfig } from '@tbca/game-core';

import { SeasonService } from './season.js';

@Controller('game')
export class GameController {
  constructor(@Inject(SeasonService) private readonly seasons: SeasonService) {}

  /** Spielinhalte der laufenden Season (Klassen, Fähigkeiten, Formeln) für die Website. */
  @Get('config')
  async config(): Promise<{
    season: { id: string; name: string };
    configVersion: number;
    game: GameConfig;
  }> {
    const current = await this.seasons.current();
    return {
      season: { id: current.id, name: current.name },
      configVersion: current.configVersion,
      game: current.game,
    };
  }
}
