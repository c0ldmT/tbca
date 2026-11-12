import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { CONFIG_SCHEMA_VERSION, type SeasonConfigData } from '@tbca/db';
import {
  DEFAULT_BATTLE_RULES,
  DEFAULT_GAME_CONFIG,
  validateGameConfig,
  simulateDungeon,
  simulateMatchups,
  simulateTeams,
  withDefaults,
  type BattleRules,
  type GameConfig,
} from '@tbca/game-core';
import {
  SIM_REPORT_FORMAT,
  SIM_REPORT_POINTS,
  type AdminConfigList,
  type AdminConfigVersion,
  type AdminSimulationReport,
  type AdminSimulationParams,
  type AdminSimulationResponse,
} from '@tbca/shared';

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
    from: number | 'defaults' | null,
    notes: string | null,
  ): Promise<AdminConfigVersion> {
    const season = await this.seasons.current();
    // Startwerte aus dem Code, z. B. nach einem Rebalancing in einem Update
    const defaults: SeasonConfigData = {
      battle: { ...DEFAULT_BATTLE_RULES },
      game: DEFAULT_GAME_CONFIG,
    };
    const source =
      from === 'defaults'
        ? { version: 'defaults' as const, data: defaults }
        : await this.get(from ?? season.configVersion);
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

  /**
   * Balancing-Simulation gegen eine Version (Entwurf → Simulation → Veröffentlichen). Läuft
   * direkt in der API: 16 Paarungen × 400 Kämpfe dauern auf einem kleinen Server wenige
   * Sekunden; größere Läufe gehören in ein Skript.
   */
  async simulate(req: AdminSimulationParams): Promise<AdminSimulationResponse> {
    const list = await this.list();
    const version =
      req.version ?? list.versions.find((v) => v.status === 'published')?.version ?? 1;
    const v = await this.get(version);
    const game = v.data.game as unknown as GameConfig;
    const battle = v.data.battle as unknown as BattleRules;
    const level = Math.min(req.level, game.maxLevel);
    const seed = req.seed ?? 'tbca-sim';
    const started = Date.now();
    const matchups =
      req.kind === 'matchups'
        ? simulateMatchups(game, battle, {
            level,
            fightsPerPair: req.samples,
            gear: req.gear,
            seed,
            configVersion: version,
          })
        : null;
    const dungeon =
      req.kind === 'dungeon'
        ? simulateDungeon(game, battle, {
            level,
            runsPerClass: req.samples,
            gear: req.gear,
            seed,
            configVersion: version,
          })
        : null;
    const teams =
      req.kind === 'teams'
        ? simulateTeams(game, battle, {
            size: req.teamSize,
            level,
            fightsPerPair: req.samples,
            gear: req.gear,
            seed,
            configVersion: version,
          })
        : null;
    return { version, status: v.status, seed, ms: Date.now() - started, matchups, dungeon, teams };
  }

  /**
   * Balancing-Report: Gewinnraten-Matrix und Dungeon-Tiefe auf mehreren Stufen mit typischer
   * Ausrüstung, dazu die vollständige Konfiguration – als Datei exportierbar.
   */
  async report(req: {
    version?: number | undefined;
    fights: number;
    runs: number;
    teamFights: number;
    seed?: string | undefined;
  }): Promise<AdminSimulationReport> {
    const list = await this.list();
    const version =
      req.version ?? list.versions.find((v) => v.status === 'published')?.version ?? 1;
    const v = await this.get(version);
    const game = v.data.game as unknown as GameConfig;
    const battle = v.data.battle as unknown as BattleRules;
    const seed = req.seed ?? 'tbca-report';
    const started = Date.now();
    const teams = (size: 2 | 3, p: (typeof SIM_REPORT_POINTS)[number]) =>
      req.teamFights > 0
        ? simulateTeams(game, battle, {
            size,
            level: p.level,
            fightsPerPair: req.teamFights,
            gear: p.gear,
            seed: `${seed}:${p.level}`,
            configVersion: version,
          })
        : null;
    const points = SIM_REPORT_POINTS.filter((p) => p.level <= game.maxLevel).map((p) => ({
      level: p.level,
      gear: p.gear,
      teams2: teams(2, p),
      teams3: teams(3, p),
      matchups: simulateMatchups(game, battle, {
        level: p.level,
        fightsPerPair: req.fights,
        gear: p.gear,
        seed: `${seed}:${p.level}`,
        configVersion: version,
      }),
      dungeon: simulateDungeon(game, battle, {
        level: p.level,
        runsPerClass: req.runs,
        gear: p.gear,
        seed: `${seed}:${p.level}`,
        configVersion: version,
      }),
    }));
    return {
      format: SIM_REPORT_FORMAT,
      generatedAt: new Date().toISOString(),
      version,
      status: v.status,
      seed,
      fights: req.fights,
      runs: req.runs,
      teamFights: req.teamFights,
      ms: Date.now() - started,
      points,
      config: v.data as unknown as Record<string, unknown>,
    };
  }
}
