import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  ATTRIBUTES,
  BuildError,
  defaultLoadout,
  deriveSnapshot,
  respecCost,
  totalXpForLevel,
  unspentPoints,
  validateBuild,
  xpToNext,
  type Attributes,
  type CharacterBuild,
  type ClassId,
  type CombatantSnapshot,
} from '@tbca/game-core';
import type { CharacterResponse, CreateCharacterRequest, LoadoutRequest } from '@tbca/shared';

import { InsufficientCreditsError } from '@tbca/db';

import { ApiError } from '../common/api-error.js';
import { SeasonService, type CurrentSeason } from '../game/season.js';
import { CHARACTER_REPOSITORY } from '../tokens.js';
import {
  CharacterExistsError,
  NameTakenError,
  type CharacterRecord,
  type CharacterRepository,
} from './types.js';

const NO_POINTS: Attributes = { str: 0, dex: 0, int: 0, con: 0 };

/**
 * Charakter der laufenden Season: anlegen, Punkte verteilen, umskillen, Klasse wechseln,
 * Loadout setzen. Alle Regeln kommen aus game-core und der Season-Konfiguration.
 */
@Injectable()
export class CharacterService {
  constructor(
    @Inject(CHARACTER_REPOSITORY) private readonly repo: CharacterRepository,
    @Inject(SeasonService) private readonly seasons: SeasonService,
  ) {}

  async get(accountId: string): Promise<CharacterResponse> {
    const { season, record } = await this.load(accountId);
    return this.view(season, record);
  }

  async create(accountId: string, req: CreateCharacterRequest): Promise<CharacterResponse> {
    const season = await this.seasons.current();
    try {
      const record = await this.repo.create({
        accountId,
        seasonId: season.id,
        name: req.name,
        classId: req.classId,
        level: 1,
        xp: 0,
        allocated: NO_POINTS,
        loadouts: { [req.classId]: defaultLoadout(season.game, req.classId, 1) },
      });
      return this.view(season, record);
    } catch (error) {
      if (error instanceof NameTakenError) {
        throw new ApiError(
          HttpStatus.CONFLICT,
          'name_taken',
          'Der Name ist in dieser Season vergeben',
        );
      }
      if (error instanceof CharacterExistsError) {
        throw new ApiError(
          HttpStatus.CONFLICT,
          'character_exists',
          'Es gibt bereits einen Charakter',
        );
      }
      throw error;
    }
  }

  async isNameAvailable(name: string): Promise<boolean> {
    const season = await this.seasons.current();
    return !(await this.repo.isNameTaken(season.id, name.trim()));
  }

  /**
   * Setzt die Verteilung der freien Punkte. Punkte können nur hinzukommen; zurücknehmen
   * geht über Umskillen.
   */
  async setAttributes(accountId: string, allocated: Attributes): Promise<CharacterResponse> {
    const { season, record } = await this.load(accountId);
    for (const a of ATTRIBUTES) {
      if (allocated[a] < record.allocated[a]) {
        throw new ApiError(
          HttpStatus.BAD_REQUEST,
          'points_decrease',
          'Verteilte Punkte lassen sich nur durch Umskillen zurücknehmen',
        );
      }
    }
    return this.update(season, { ...record, allocated });
  }

  /** Setzt alle freien Punkte zurück; kostet Level × 10 Credits (laut Konfiguration). */
  async respec(accountId: string): Promise<CharacterResponse> {
    const { season, record } = await this.load(accountId);
    const spent = ATTRIBUTES.reduce((sum, a) => sum + record.allocated[a], 0);
    if (spent === 0) return this.view(season, record);
    return this.update(
      season,
      { ...record, allocated: NO_POINTS },
      {
        amount: respecCost(season.game, record.level),
        kind: 'respec',
      },
    );
  }

  /** Wechselt die Klasse; das Loadout der anderen Klasse bleibt gespeichert. */
  async switchClass(accountId: string, classId: ClassId): Promise<CharacterResponse> {
    const { season, record } = await this.load(accountId);
    if (record.classId === classId) return this.view(season, record);
    const loadouts = {
      ...record.loadouts,
      [classId]: this.usableLoadout(season, { ...record, classId }),
    };
    return this.update(season, { ...record, classId, loadouts });
  }

  async setLoadout(accountId: string, req: LoadoutRequest): Promise<CharacterResponse> {
    const { season, record } = await this.load(accountId);
    const loadouts = { ...record.loadouts, [record.classId]: req };
    return this.update(season, { ...record, loadouts });
  }

  // --- intern -----------------------------------------------------------------

  private async load(
    accountId: string,
  ): Promise<{ season: CurrentSeason; record: CharacterRecord }> {
    const season = await this.seasons.current();
    const record = await this.repo.findForAccount(accountId, season.id);
    if (!record) {
      throw new ApiError(
        HttpStatus.NOT_FOUND,
        'no_character',
        'Noch kein Charakter in dieser Season',
      );
    }
    return { season, record };
  }

  private async update(
    season: CurrentSeason,
    record: CharacterRecord,
    charge?: { amount: number; kind: 'respec' },
  ): Promise<CharacterResponse> {
    try {
      validateBuild(season.game, this.build(record, record.loadouts[record.classId]!));
    } catch (error) {
      if (error instanceof BuildError)
        throw new ApiError(HttpStatus.BAD_REQUEST, error.code, error.message);
      throw error;
    }
    try {
      await this.repo.save(record, charge);
    } catch (error) {
      if (error instanceof InsufficientCreditsError) {
        throw new ApiError(HttpStatus.CONFLICT, 'insufficient_credits', 'Nicht genug Credits');
      }
      throw error;
    }
    return this.view(season, record);
  }

  private usableLoadout(season: CurrentSeason, record: CharacterRecord): CharacterBuild['loadout'] {
    return usableLoadout(season, record);
  }

  private build(record: CharacterRecord, loadout: CharacterBuild['loadout']): CharacterBuild {
    return toBuild(record, loadout);
  }

  private async view(season: CurrentSeason, record: CharacterRecord): Promise<CharacterResponse> {
    const game = season.game;
    const loadout = this.usableLoadout(season, record);
    const snapshot = deriveSnapshot(game, this.build(record, loadout));
    const { stats } = snapshot;
    return {
      id: record.id,
      name: record.name,
      classId: record.classId,
      level: record.level,
      xp: record.xp,
      xpIntoLevel: record.xp - totalXpForLevel(game, record.level),
      xpToNext: record.level >= game.maxLevel ? null : xpToNext(game, record.level),
      season: { id: season.id, name: season.name, configVersion: season.configVersion },
      allocated: record.allocated,
      attributes: snapshot.attributes,
      unspentPoints: unspentPoints(game, record.level, record.allocated),
      respecCost: respecCost(game, record.level),
      credits: await this.repo.balance(record.accountId, season.id),
      stats: {
        maxHp: stats.maxHp,
        armor: stats.armor,
        firewall: stats.firewall,
        initiative: stats.initiative,
        accuracy: stats.accuracy,
        evasion: stats.evasion,
        critChance: stats.critChance,
        critDamage: stats.critDamage,
        energyMax: stats.energyMax,
        energyRegen: stats.energyRegen,
        threat: stats.threat,
      },
      loadout: { abilities: [...loadout.abilities], tactics: [...loadout.tactics] },
    };
  }
}

export function toBuild(
  record: CharacterRecord,
  loadout: CharacterBuild['loadout'],
): CharacterBuild {
  return {
    id: record.id,
    name: record.name,
    level: record.level,
    classId: record.classId,
    allocated: record.allocated,
    loadout,
  };
}

/** Gespeichertes Loadout, falls es zur aktuellen Konfiguration passt, sonst das Standard-Loadout. */
export function usableLoadout(
  season: CurrentSeason,
  record: CharacterRecord,
): CharacterBuild['loadout'] {
  const stored = record.loadouts[record.classId];
  if (stored) {
    try {
      validateBuild(season.game, toBuild(record, stored));
      return stored;
    } catch {
      // z. B. Fähigkeit nach einer Konfigurationsänderung entfernt
    }
  }
  return defaultLoadout(season.game, record.classId, record.level);
}

/** Kampf-Momentaufnahme eines gespeicherten Charakters. */
export function snapshotOf(season: CurrentSeason, record: CharacterRecord): CombatantSnapshot {
  return deriveSnapshot(season.game, toBuild(record, usableLoadout(season, record)));
}
