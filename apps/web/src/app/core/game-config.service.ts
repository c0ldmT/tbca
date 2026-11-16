import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import type { AbilityDef, GameConfig } from '@tbca/game-core';
import { firstValueFrom } from 'rxjs';

import { toFailure } from './api-failure';

export interface GameConfigResponse {
  season: { id: string; name: string; isTest: boolean };
  configVersion: number;
  game: GameConfig;
}

/** Spielinhalte der laufenden Season (Klassen, Fähigkeiten, Formeln), einmal geladen. */
@Injectable({ providedIn: 'root' })
export class GameConfigService {
  private readonly http = inject(HttpClient);
  private loading: Promise<GameConfigResponse> | null = null;

  readonly current = signal<GameConfigResponse | null>(null);

  /** Wirft ApiFailure, z. B. no_active_season, wenn gerade keine Season läuft. */
  load(): Promise<GameConfigResponse> {
    this.loading ??= firstValueFrom(this.http.get<GameConfigResponse>('/api/game/config')).then(
      (res) => {
        this.current.set(res);
        return res;
      },
      (error: unknown) => {
        this.loading = null;
        throw toFailure(error);
      },
    );
    return this.loading;
  }

  ability(id: string): AbilityDef | undefined {
    return this.current()?.game.abilities.find((a) => a.id === id);
  }
}
