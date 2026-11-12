import { createHash, randomBytes } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { ENGINE_VERSION, type CombatantSnapshot, type Clock } from '@tbca/game-core';
import { DATA_EXPORT_FORMAT, type AdminDataExport } from '@tbca/shared';

import type { Env } from '../config/env.js';
import { dayKey } from '../fight/day.js';
import { SeasonService } from '../game/season.js';
import { ADMIN_EXPORT_REPOSITORY, ADMIN_REPOSITORY, CLOCK, ENV } from '../tokens.js';
import { ConfigService } from './config.service.js';
import type { AdminExportRepository, AdminRepository } from './types.js';

const DAY_MS = 86_400_000;

/**
 * Anonymisierter Export der Spieldaten für Balancing-Auswertungen (Abschnitt 14): Konfiguration,
 * Charakter-Builds, Kämpfe mit Momentaufnahmen, Dungeon-Runs und Wirtschafts-Kennzahlen.
 * Keine Namen, Discord-IDs oder Account-IDs – Charaktere tragen Kürzel, die nur innerhalb
 * eines Exports gleich sind (zufälliges Salz je Export).
 */
@Injectable()
export class ExportService {
  constructor(
    @Inject(ADMIN_EXPORT_REPOSITORY) private readonly repo: AdminExportRepository,
    @Inject(ADMIN_REPOSITORY) private readonly admin: AdminRepository,
    @Inject(SeasonService) private readonly seasons: SeasonService,
    @Inject(ConfigService) private readonly configs: ConfigService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async export(
    actor: string,
    input: { days: number; maxFights: number },
  ): Promise<AdminDataExport> {
    const season = await this.seasons.current();
    const since = new Date(this.clock.now() - input.days * DAY_MS);
    const [rows, list, published] = await Promise.all([
      this.repo.rows(season.id, since, input.maxFights),
      this.configs.list(),
      this.configs.get(season.configVersion),
    ]);
    const salt = randomBytes(16);
    const refs = new Map<string, string>();
    const ref = (id: string | null | undefined): string | null => {
      if (!id) return null;
      let value = refs.get(id);
      if (!value) {
        value = createHash('sha256').update(salt).update(id).digest('hex').slice(0, 10);
        refs.set(id, value);
      }
      return value;
    };
    const fighter = (c: CombatantSnapshot) => ({
      ref: ref(c.id),
      classId: c.classId,
      level: c.level,
      affinity: c.affinity,
      attributes: c.attributes,
      stats: c.stats,
      attack: c.attack,
      modifiers: { ...(c.modifiers ?? {}) } as Record<string, number>,
      abilities: c.abilities.map((a) => a.id),
      tactics: c.tactics,
    });

    const doc: AdminDataExport = {
      format: DATA_EXPORT_FORMAT,
      generatedAt: new Date().toISOString(),
      engineVersion: ENGINE_VERSION,
      season: {
        name: season.name,
        isTest: season.isTest,
        configVersion: season.configVersion,
        day: dayKey(this.clock.now(), this.env.GAME_TIMEZONE),
      },
      window: { since: since.toISOString(), days: input.days, maxFights: input.maxFights },
      configVersions: list.versions.map((v) => ({
        version: v.version,
        status: v.status,
        publishedAt: v.publishedAt,
      })),
      config: published.data,
      characters: rows.characters.map((c) => ({
        ref: ref(c.id)!,
        isBot: c.isBot,
        classId: c.classId,
        level: c.level,
        xp: c.xp,
        allocated: c.allocated,
        createdDay: dayKey(c.createdAt.getTime(), this.env.GAME_TIMEZONE),
        loadout: c.loadout,
        equipment: c.equipment.map((e) => ({ slot: e.slot, ...e.item })),
      })),
      fights: rows.fights.map((f) => ({
        day: f.rewardDay,
        at: f.createdAt.toISOString(),
        kind: f.kind,
        configVersion: f.configVersion,
        engineVersion: f.engineVersion,
        rounds: f.rounds,
        winnerTeam: f.winnerTeam,
        reason: f.reason,
        teams: f.teams.map((team) => team.map(fighter)),
        rewards: f.participants
          .filter((p) => p.characterId)
          .map((p) => ({
            ref: ref(p.characterId),
            team: p.team,
            won: p.won,
            rewarded: p.rewarded,
            xp: p.xpAwarded,
            credits: p.creditsAwarded,
          })),
      })),
      dungeonRuns: rows.runs.map(({ characterId, ...r }) => ({ ref: ref(characterId), ...r })),
      economy: { credits: rows.credits, items: rows.items, shopPurchases: rows.purchases },
      passiveXp: rows.passive,
    };
    await this.admin.audit({
      actorAccountId: actor,
      action: 'data.export',
      targetType: 'season',
      targetId: season.id,
      data: {
        days: input.days,
        characters: doc.characters.length,
        fights: doc.fights.length,
        runs: doc.dungeonRuns.length,
      },
    });
    return doc;
  }
}
