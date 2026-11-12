import { randomUUID } from 'node:crypto';

import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { InsufficientCreditsError } from '@tbca/db';
import {
  BOT_NAMES,
  botBuild,
  botEquipment,
  deriveSnapshot,
  ENGINE_VERSION,
  levelFromXp,
  opponentRerollCost,
  pickDailyOpponents,
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
import { RatingService } from '../league/rating.service.js';
import { ProgressionService } from '../progression/progression.service.js';
import { CHARACTER_REPOSITORY, CLOCK, ENV, FIGHT_REPOSITORY, PVP_REPOSITORY } from '../tokens.js';
import { dayKey } from './day.js';
import type { DailyOpponents, FightRepository, PvpRepository, StoredFight } from './types.js';

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
    @Inject(ProgressionService) private readonly progression: ProgressionService,
    @Inject(RatingService) private readonly ratings: RatingService,
    @Inject(PVP_REPOSITORY) private readonly pvp: PvpRepository,
  ) {}

  async status(accountId: string): Promise<PvpStatus> {
    const { season, me } = await this.mine(accountId);
    const day = this.today();
    const counts = await this.fights.rewardCounts(me.id, day);
    const daily = await this.pvp.dailyOpponents(me.id, day);
    return {
      day,
      rewardedToday: counts.today,
      dailyLimit: season.game.pvp.dailyRewardedFights,
      reroll: {
        cost: opponentRerollCost(season.game.pvp, me.level),
        available: !daily.rerolled,
      },
    };
  }

  /**
   * Tagesgegner: eine kleine, täglich neue Auswahl zufälliger Gegner nahe am eigenen Level. Auf
   * der Website wird nur gegen sie herausgefordert; freie Herausforderungen gibt es nur über
   * Discord, und dort muss der Gegner annehmen.
   */
  async opponents(accountId: string): Promise<OpponentView[]> {
    const { season, me } = await this.mine(accountId);
    const day = this.today();
    const { ids } = await this.dailyOpponents(season, me, day);
    const counts = await this.fights.rewardCounts(me.id, day);
    const median = await this.progression.median(season.id);
    const rules = season.game.pvp;
    const views: OpponentView[] = [];
    for (const id of ids) {
      const o = await this.characters.findById(id);
      if (!o) continue;
      const done = counts.byOpponent.get(o.id) ?? 0;
      const base = pvpReward(season.game, {
        mode: 'rated',
        won: true,
        level: me.level,
        opponentLevel: o.level,
        rewardedToday: counts.today,
        rewardedVsOpponentToday: done,
        opponentIsBot: o.isBot ?? false,
        testSeason: season.isTest,
      });
      const reward = this.progression.boost(season.game, base, me.level, median);
      views.push({
        id: o.id,
        name: o.name,
        level: o.level,
        classId: o.classId,
        isBot: o.isBot ?? false,
        winXp: reward.xp,
        limit: reward.limit,
        rewardsLeft: rules.sameOpponentPermille.slice(done).filter((x) => x > 0).length,
      });
    }
    return views;
  }

  /** Auswahl des Tages; entsteht beim ersten Abruf und bleibt bis Tagesende fest. */
  private async dailyOpponents(
    season: CurrentSeason,
    me: CharacterRecord,
    day: string,
  ): Promise<DailyOpponents> {
    const stored = await this.pvp.dailyOpponents(me.id, day);
    if (stored.ids.length > 0) return stored;
    return this.pvp.saveDailyOpponents(me.id, day, await this.pick(season, me, day));
  }

  private async pick(
    season: CurrentSeason,
    me: CharacterRecord,
    day: string,
    exclude: readonly string[] = [],
    salt = '',
  ): Promise<string[]> {
    const candidates = await this.characters.search(season.id, '', me.accountId, me.level, 60);
    return pickDailyOpponents(season.game.pvp, {
      level: me.level,
      candidates,
      seed: `${me.id}:${day}${salt}`,
      testSeason: season.isTest,
      exclude,
    });
  }

  /** Tagesgegner einmal am Tag gegen Credits neu würfeln; andere Gegner werden bevorzugt. */
  async rerollOpponents(accountId: string): Promise<OpponentView[]> {
    const { season, me } = await this.mine(accountId);
    const day = this.today();
    const current = await this.dailyOpponents(season, me, day);
    if (current.rerolled)
      throw new ApiError(HttpStatus.CONFLICT, 'already_rerolled', 'Heute schon neu gewürfelt');
    const ids = await this.pick(season, me, day, current.ids, ':reroll');
    let done: boolean;
    try {
      done = await this.pvp.rerollDailyOpponents({
        characterId: me.id,
        day,
        ids,
        charge: {
          seasonId: season.id,
          accountId,
          amount: opponentRerollCost(season.game.pvp, me.level),
        },
      });
    } catch (error) {
      if (error instanceof InsufficientCreditsError)
        throw new ApiError(HttpStatus.CONFLICT, 'insufficient_credits', 'Nicht genug Credits');
      throw error;
    }
    if (!done)
      throw new ApiError(HttpStatus.CONFLICT, 'already_rerolled', 'Heute schon neu gewürfelt');
    return this.opponents(accountId);
  }

  /**
   * Herausforderung. Ohne `direct` nur gegen einen der Tagesgegner; `direct` nutzen angenommene
   * Discord-Herausforderungen und vom Server gewählte Gegner (Platzierung).
   */
  async challenge(
    accountId: string,
    req: ChallengeRequest,
    options: { direct?: boolean; rewardOpponent?: boolean } = {},
  ): Promise<ChallengeResponse> {
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
    if (
      !options.direct &&
      !(await this.dailyOpponents(season, me, this.today())).ids.includes(opponent.id)
    ) {
      throw new ApiError(
        HttpStatus.FORBIDDEN,
        'not_daily_opponent',
        'Nur Tagesgegner – andere über Discord herausfordern',
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
    const median = await this.progression.median(season.id);

    // Angenommene Herausforderungen (Discord) belohnen auch den Gegner – nach denselben Regeln
    const both = options.rewardOpponent === true;
    const ids = both ? [me.id, opponent.id] : [me.id];
    const response = await this.fights.lockedMany(ids, async (tx) => {
      const rewardFor = async (
        c: CharacterRecord,
        other: CharacterRecord,
        hasWon: boolean,
      ): Promise<ReturnType<typeof pvpReward>> => {
        const counts = await tx.rewardCounts(c.id, day);
        const base = pvpReward(season.game, {
          mode: req.mode,
          won: hasWon,
          level: c.level,
          opponentLevel: other.level,
          rewardedToday: counts.today,
          rewardedVsOpponentToday: counts.byOpponent.get(other.id) ?? 0,
          opponentIsBot: other.isBot ?? false,
          testSeason: season.isTest,
        });
        // Aufholbonus: mehr XP, wer weit unter dem Median der Season liegt
        return this.progression.boost(season.game, base, c.level, median);
      };
      const reward = await rewardFor(me, opponent, won);
      const theirs = both ? await rewardFor(opponent, me, result.winner === 1) : null;
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
            creditsAwarded: reward.credits,
            opponentCharacterId: opponent.id,
          },
          {
            team: 1,
            slot: 0,
            characterId: opponent.id,
            initiator: false,
            won: result.winner === 1,
            rewarded: theirs?.rewarded ?? false,
            xpAwarded: theirs?.xp ?? 0,
            creditsAwarded: theirs?.credits ?? 0,
            opponentCharacterId: me.id,
          },
        ],
      });
      // XP erst nach dem Kampf anrechnen; das Level folgt aus der XP-Kurve der Season.
      const grant = async (c: CharacterRecord, r: { xp: number; credits: number }) => {
        if (r.credits > 0) await tx.rewardCredits(season.id, c.accountId, r.credits, fightId);
        if (r.xp <= 0) return c.level;
        const xp = c.xp + r.xp;
        const level = Math.max(c.level, levelFromXp(season.game, xp).level);
        await tx.setProgress(c.id, xp, level);
        return level;
      };
      const after = await grant(me, reward);
      if (theirs) await grant(opponent, theirs);
      const view = (r: ReturnType<typeof pvpReward>) => ({
        xp: r.xp,
        credits: r.credits,
        rewarded: r.rewarded,
        limit: r.limit,
        underdogBonus: r.underdogBonus,
      });
      return {
        fightId,
        won,
        draw: result.winner === null,
        reward: view(reward),
        level: { before: me.level, after },
        ...(theirs ? { opponentReward: view(theirs) } : {}),
      };
    });
    // Gewertete Kämpfe schreiben das Glicko-2-Rating beider Seiten fort (Platzierung, Liga)
    if (req.mode === 'rated')
      await this.ratings.record(
        season.id,
        me.id,
        opponent.id,
        result.winner === null ? null : (result.winner as 0 | 1),
      );
    return response;
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
    // Trainingsgegner tragen dieselbe Ausrüstung wie Bot-Spieler ihres Levels
    const dummy = deriveSnapshot(season.game, {
      ...botBuild(season.game, {
        id: `training-${seed}`,
        name,
        classId: req.classId,
        level: req.level,
        seed,
      }),
      equipment: botEquipment(season.game, req.classId, req.level, `training:${seed}`),
    });
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
            creditsAwarded: 0,
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
            creditsAwarded: 0,
            opponentCharacterId: me.id,
          },
        ],
      }),
    );
    return {
      fightId,
      won,
      draw: result.winner === null,
      reward: { xp: 0, credits: 0, rewarded: false, limit: 'training', underdogBonus: 0 },
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
