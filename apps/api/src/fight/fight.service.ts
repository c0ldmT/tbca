import { randomUUID } from 'node:crypto';

import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  BOT_NAMES,
  botBuild,
  deriveSnapshot,
  ENGINE_VERSION,
  levelFromXp,
  pvpReward,
  simulateBattle,
  type Clock,
  type CombatantSnapshot,
} from '@tbca/game-core';
import type {
  ChallengeRequest,
  ChallengeResponse,
  TrainingRequest,
  FightSummary,
  FightView,
  OpponentView,
  PvpStatus,
} from '@tbca/shared';

import { snapshotOf } from '../character/character.service.js';
import type { CharacterRecord, CharacterRepository } from '../character/types.js';
import { ApiError } from '../common/api-error.js';
import type { Env } from '../config/env.js';
import { SeasonService, type CurrentSeason } from '../game/season.js';
import { CHARACTER_REPOSITORY, CLOCK, ENV, FIGHT_REPOSITORY } from '../tokens.js';
import { dayKey } from './day.js';
import type { FightRepository, StoredFight } from './types.js';

/**
 * Asynchrone PvP-Herausforderungen gegen die Momentaufnahme des Gegners (Abschnitt 9) und
 * gespeicherte Kämpfe für Replays. Der Server rechnet; der Client zeigt nur an.
 */
@Injectable()
export class FightService {
  constructor(
    @Inject(FIGHT_REPOSITORY) private readonly fights: FightRepository,
    @Inject(CHARACTER_REPOSITORY) private readonly characters: CharacterRepository,
    @Inject(SeasonService) private readonly seasons: SeasonService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async status(accountId: string): Promise<PvpStatus> {
    const { season, me } = await this.mine(accountId);
    const day = this.today();
    const counts = await this.fights.rewardCounts(me.id, day);
    return { day, rewardedToday: counts.today, dailyLimit: season.game.pvp.dailyRewardedFights };
  }

  async opponents(accountId: string, query: string): Promise<OpponentView[]> {
    const { season, me } = await this.mine(accountId);
    const [list, counts] = await Promise.all([
      this.characters.search(season.id, query.trim().slice(0, 20), accountId, me.level, 20),
      this.fights.rewardCounts(me.id, this.today()),
    ]);
    return list.map((o) => {
      const reward = pvpReward(season.game, {
        mode: 'rated',
        won: true,
        level: me.level,
        opponentLevel: o.level,
        rewardedToday: counts.today,
        rewardedVsOpponentToday: counts.byOpponent.get(o.id) ?? 0,
        opponentIsBot: o.isBot,
        testSeason: season.isTest,
      });
      return {
        id: o.id,
        name: o.name,
        level: o.level,
        classId: o.classId,
        isBot: o.isBot,
        winXp: reward.xp,
        limit: reward.limit,
      };
    });
  }

  async challenge(accountId: string, req: ChallengeRequest): Promise<ChallengeResponse> {
    const { season, me } = await this.mine(accountId);
    const opponent = await this.characters.findById(req.opponentId);
    if (!opponent || opponent.seasonId !== season.id) {
      throw new ApiError(HttpStatus.NOT_FOUND, 'opponent_not_found', 'Gegner nicht gefunden');
    }
    if (opponent.accountId === accountId) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        'self_challenge',
        'Du kannst dich nicht selbst herausfordern',
      );
    }

    const seed = randomUUID();
    const teams: CombatantSnapshot[][] = [[snapshotOf(season, me)], [snapshotOf(season, opponent)]];
    const result = simulateBattle({
      engineVersion: ENGINE_VERSION,
      configVersion: season.configVersion,
      seed,
      rules: season.battle,
      teams,
    });
    const won = result.winner === 0;
    const day = this.today();

    return this.fights.locked(me.id, async (tx) => {
      const counts = await tx.rewardCounts(me.id, day);
      const reward = pvpReward(season.game, {
        mode: req.mode,
        won,
        level: me.level,
        opponentLevel: opponent.level,
        rewardedToday: counts.today,
        rewardedVsOpponentToday: counts.byOpponent.get(opponent.id) ?? 0,
        opponentIsBot: opponent.isBot ?? false,
        testSeason: season.isTest,
      });
      const fightId = await tx.insert({
        seasonId: season.id,
        kind: req.mode === 'rated' ? 'pvp_rated' : 'pvp_friendly',
        seed,
        configVersion: season.configVersion,
        input: { rules: season.battle, teams },
        result,
        rewardDay: day,
        participants: [
          {
            team: 0,
            slot: 0,
            characterId: me.id,
            initiator: true,
            won,
            rewarded: reward.rewarded,
            xpAwarded: reward.xp,
            opponentCharacterId: opponent.id,
          },
          {
            team: 1,
            slot: 0,
            characterId: opponent.id,
            initiator: false,
            won: result.winner === 1,
            rewarded: false,
            xpAwarded: 0,
            opponentCharacterId: me.id,
          },
        ],
      });

      // XP erst nach dem Kampf anrechnen; das Level folgt aus der XP-Kurve der Season.
      let after = me.level;
      if (reward.xp > 0) {
        const xp = me.xp + reward.xp;
        after = Math.max(me.level, levelFromXp(season.game, xp).level);
        await tx.setProgress(me.id, xp, after);
      }
      return {
        fightId,
        won,
        draw: result.winner === null,
        reward: {
          xp: reward.xp,
          rewarded: reward.rewarded,
          limit: reward.limit,
          underdogBonus: reward.underdogBonus,
        },
        level: { before: me.level, after },
      };
    });
  }

  /**
   * Trainingskampf gegen einen computergesteuerten Gegner beliebiger Klasse und Stufe.
   * Zum Ausprobieren von Punkten, Loadout und Taktik: gespeichert und abspielbar, ohne Belohnung.
   */
  async training(accountId: string, req: TrainingRequest): Promise<ChallengeResponse> {
    const { season, me } = await this.mine(accountId);
    if (req.level > season.game.maxLevel) {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'invalid_level', 'Ungültiges Level');
    }
    const seed = randomUUID();
    const name = BOT_NAMES[Number.parseInt(seed.slice(0, 8), 16) % BOT_NAMES.length]!;
    const dummy = deriveSnapshot(
      season.game,
      botBuild(season.game, {
        id: `training-${seed}`,
        name,
        classId: req.classId,
        level: req.level,
        seed,
      }),
    );
    const teams: CombatantSnapshot[][] = [[snapshotOf(season, me)], [dummy]];
    const result = simulateBattle({
      engineVersion: ENGINE_VERSION,
      configVersion: season.configVersion,
      seed,
      rules: season.battle,
      teams,
    });
    const won = result.winner === 0;
    const fightId = await this.fights.locked(me.id, (tx) =>
      tx.insert({
        seasonId: season.id,
        kind: 'training',
        seed,
        configVersion: season.configVersion,
        input: { rules: season.battle, teams },
        result,
        rewardDay: this.today(),
        participants: [
          {
            team: 0,
            slot: 0,
            characterId: me.id,
            initiator: true,
            won,
            rewarded: false,
            xpAwarded: 0,
            opponentCharacterId: null,
          },
          {
            team: 1,
            slot: 0,
            characterId: null,
            initiator: false,
            won: result.winner === 1,
            rewarded: false,
            xpAwarded: 0,
            opponentCharacterId: me.id,
          },
        ],
      }),
    );
    return {
      fightId,
      won,
      draw: result.winner === null,
      reward: { xp: 0, rewarded: false, limit: 'training', underdogBonus: 0 },
      level: { before: me.level, after: me.level },
    };
  }

  async get(id: string): Promise<FightView> {
    const f = await this.fights.findById(id);
    if (!f) throw new ApiError(HttpStatus.NOT_FOUND, 'fight_not_found', 'Kampf nicht gefunden');
    return {
      id: f.id,
      kind: f.kind,
      createdAt: f.createdAt.toISOString(),
      engineVersion: f.engineVersion,
      configVersion: f.configVersion,
      seed: f.seed,
      logHash: f.result.logHash,
      winner: f.result.winner,
      reason: f.result.reason,
      rounds: f.result.rounds,
      teams: f.input.teams.map((team) =>
        team.map((c) => ({
          id: c.id,
          name: c.name,
          classId: c.classId,
          level: c.level,
          maxHp: c.stats.maxHp,
          energyMax: c.stats.energyMax,
        })),
      ),
      events: [...f.result.events],
      rewards: f.participants.flatMap((p) =>
        p.characterId ? [{ characterId: p.characterId, xp: p.xpAwarded }] : [],
      ),
    };
  }

  async recent(accountId: string): Promise<FightSummary[]> {
    const { me } = await this.mine(accountId);
    const list = await this.fights.listForCharacter(me.id, 20);
    return list.map((f) => summarize(f, me.id));
  }

  private today(): string {
    return dayKey(this.clock.now(), this.env.GAME_TIMEZONE);
  }

  private async mine(accountId: string): Promise<{ season: CurrentSeason; me: CharacterRecord }> {
    const season = await this.seasons.current();
    const me = await this.characters.findForAccount(accountId, season.id);
    if (!me)
      throw new ApiError(
        HttpStatus.NOT_FOUND,
        'no_character',
        'Noch kein Charakter in dieser Season',
      );
    return { season, me };
  }
}

function summarize(f: StoredFight, characterId: string): FightSummary {
  const mine = f.participants.find((p) => p.characterId === characterId);
  const myTeam = mine?.team ?? 0;
  const opponents = f.input.teams.flatMap((team, index) =>
    index === myTeam ? [] : team.map((c) => c.name),
  );
  return {
    id: f.id,
    kind: f.kind,
    createdAt: f.createdAt.toISOString(),
    won: f.result.winner === myTeam,
    draw: f.result.winner === null,
    opponents,
    xp: mine?.xpAwarded ?? 0,
  };
}
