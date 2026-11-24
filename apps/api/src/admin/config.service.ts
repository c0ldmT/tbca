import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { CONFIG_SCHEMA_VERSION, type SeasonConfigData } from '@tbca/db';
import {
  DEFAULT_BATTLE_RULES,
  DEFAULT_GAME_CONFIG,
  validateGameConfig,
  withDefaults,
} from '@tbca/game-core';
import type { AdminConfigList, AdminConfigVersion } from '@tbca/shared';

import { ApiError } from '../common/api-error.js';
import { SeasonService } from '../game/season.js';
import { ADMIN_REPOSITORY, CONFIG_REPOSITORY } from '../tokens.js';
import type { ConfigRepository } from './config.repository.js';
import type { AdminRepository } from './types.js';

/**
 * Versionierte Season-Konfiguration (Abschnitt 13): Entwürfe anlegen, bearbeiten (z. B. im
 * Item-Editor), prüfen und veröffentlichen. Veröffentlichen wirkt sofort; laufende Kämpfe und
 * Replays bleiben unberührt, weil Kämpfe ihre Momentaufnahmen speichern.
 */
@Injectable()
export class ConfigService {
  constructor(
    @Inject(CONFIG_REPOSITORY) private readonly configs: ConfigRepository,
    @Inject(ADMIN_REPOSITORY) private readonly admin: AdminRepository,
    @Inject(SeasonService) private readonly seasons: SeasonService,
  ) {}

  async list(): Promise<AdminConfigList> {
    const season = await this.seasons.current();
    const versions = await this.configs.list(season.id);
    return {
      season: { id: season.id, name: season.name },
      versions: versions.map((v) => ({
        ...v,
        createdAt: v.createdAt.toISOString(),
        publishedAt: v.publishedAt?.toISOString() ?? null,
      })),
    };
  }

  async get(version: number): Promise<AdminConfigVersion> {
    const season = await this.seasons.current();
    const row = await this.configs.get(season.id, version);
    if (!row)
      throw new ApiError(HttpStatus.NOT_FOUND, 'config_not_found', 'Version nicht gefunden');
    return {
      version: row.version,
      status: row.status,
      notes: row.notes,
      // Fehlende Bereiche älterer Versionen werden mit den Startwerten gezeigt.
      data: {
        battle: withDefaults(DEFAULT_BATTLE_RULES, row.data.battle) as unknown as Record<
          string,
          unknown
        >,
        game: withDefaults(DEFAULT_GAME_CONFIG, row.data.game) as unknown as Record<
          string,
          unknown
        >,
      },
    };
  }

  async createDraft(
    actor: string,
    from: number | null,
    notes: string | null,
  ): Promise<AdminConfigVersion> {
    const season = await this.seasons.current();
    const source = from ? await this.get(from) : await this.get(season.configVersion);
    const version = await this.configs.createDraft(
      season.id,
      source.data as unknown as SeasonConfigData,
      notes,
      CONFIG_SCHEMA_VERSION,
      actor,
    );
    await this.admin.audit({
      actorAccountId: actor,
      action: 'config.draft',
      targetType: 'config',
      targetId: String(version),
      data: { from: source.version },
    });
    return this.get(version);
  }

  async update(
    actor: string,
    version: number,
    data: SeasonConfigData,
    notes: string | null,
  ): Promise<AdminConfigVersion> {
    const current = await this.get(version);
    if (current.status !== 'draft')
      throw new ApiError(HttpStatus.CONFLICT, 'config_not_draft', 'Nur Entwürfe sind bearbeitbar');
    this.assertValid(data);
    const season = await this.seasons.current();
    await this.configs.updateDraft(season.id, version, data, notes);
    await this.admin.audit({
      actorAccountId: actor,
      action: 'config.update',
      targetType: 'config',
      targetId: String(version),
      data: {},
    });
    return this.get(version);
  }

  async publish(actor: string, version: number): Promise<AdminConfigList> {
    const current = await this.get(version);
    if (current.status !== 'draft')
      throw new ApiError(
        HttpStatus.CONFLICT,
        'config_not_draft',
        'Nur Entwürfe lassen sich veröffentlichen',
      );
    this.assertValid(current.data as unknown as SeasonConfigData);
    const season = await this.seasons.current();
    await this.configs.publish(season.id, version);
    await this.admin.audit({
      actorAccountId: actor,
      action: 'config.publish',
      targetType: 'config',
      targetId: String(version),
      data: { previous: season.configVersion },
    });
    return this.list();
  }

  private assertValid(data: SeasonConfigData): void {
    const problems = data.game
      ? validateGameConfig(withDefaults(DEFAULT_GAME_CONFIG, data.game))
      : ['Spielinhalte fehlen'];
    if (problems.length > 0) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        'invalid_config',
        'Die Konfiguration ist ungültig',
        { problems },
      );
    }
  }
}
