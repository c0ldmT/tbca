import { randomBytes, randomUUID } from 'node:crypto';

import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  ENGINE_VERSION,
  levelFromXp,
  pickDailyOpponents,
  pvpReward,
  simulateBattle,
  type Clock,
  type CombatantSnapshot,
  type TargetSelector,
} from '@tbca/game-core';
import {
  TEAM_MAX_MEMBERS,
  type CommunityMemberView,
  type CommunityView,
  type TeamChallengeResponse,
  type TeamChallengeReward,
  type TeamOpponentView,
  type TeamSummary,
  type TeamView,
} from '@tbca/shared';

import { snapshotOf } from '../character/character.service.js';
import type { CharacterRecord, CharacterRepository } from '../character/types.js';
import { ApiError } from '../common/api-error.js';
import type { Env } from '../config/env.js';
import { dayKey } from '../fight/day.js';
import type { FightRepository, PvpRepository } from '../fight/types.js';
import { SeasonService, type CurrentSeason } from '../game/season.js';
import { RatingService } from '../league/rating.service.js';
import { ProgressionService } from '../progression/progression.service.js';
import {
  ADMIN_REPOSITORY,
  CHARACTER_REPOSITORY,
  CLOCK,
  ENV,
  FIGHT_REPOSITORY,
  PVP_REPOSITORY,
  TEAM_REPOSITORY,
} from '../tokens.js';
import type { AdminRepository } from '../admin/types.js';

const MODERATOR_XP_LIMIT = 5_000;
import {
  TeamConflictError,
  type CommunityRole,
  type TeamRecord,
  type TeamRepository,
} from './types.js';

const err = (status: HttpStatus, code: string, message: string) =>
  new ApiError(status, code, message);

/**
 * Teams (Spezifikation, Abschnitt 9): feste Gruppen bis 6 Mitglieder in einer Community,
 * Team-Herausforderungen 2v2 und 3v3 nach denselben Belohnungsregeln wie 1v1 mit Team-Taktik
 * (Fokusziel). Gegner kämpfen asynchron mit ihrer Standard-Aufstellung.
 */
@Injectable()
export class TeamService {
  constructor(
    @Inject(TEAM_REPOSITORY) private readonly teams: TeamRepository,
    @Inject(CHARACTER_REPOSITORY) private readonly characters: CharacterRepository,
    @Inject(FIGHT_REPOSITORY) private readonly fights: FightRepository,
    @Inject(SeasonService) private readonly seasons: SeasonService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ENV) private readonly env: Env,
    @Inject(ADMIN_REPOSITORY) private readonly admin: AdminRepository,
    @Inject(ProgressionService) private readonly progression: ProgressionService,
    @Inject(RatingService) private readonly ratings: RatingService,
    @Inject(PVP_REPOSITORY) private readonly pvp: PvpRepository,
  ) {}

  communities(accountId: string): Promise<CommunityView[]> {
    return this.teams.communities(accountId);
  }

  /** Mitgliederliste für Moderatoren und Admins der Community. */
  async communityMembers(accountId: string, communityId: string): Promise<CommunityMemberView[]> {
    await this.requireRole(accountId, communityId, 'moderator');
    const season = await this.seasons.current();
    const members = await this.teams.members(communityId);
    const chars = await this.charactersOf(
      season,
      members.map((m) => m.accountId),
    );
    return members.map((m, i) => ({
      accountId: m.accountId,
      role: m.role,
      home: m.isHome,
      character: chars[i]
        ? {
            name: chars[i]!.name,
            level: chars[i]!.level,
            xp: chars[i]!.xp,
            classId: chars[i]!.classId,
          }
        : null,
    }));
  }

  /** Rollen vergibt nur ein Community-Admin; der letzte Admin kann sich nicht selbst absetzen. */
  async setCommunityRole(
    accountId: string,
    communityId: string,
    target: string,
    role: CommunityRole,
  ) {
    await this.requireRole(accountId, communityId, 'admin');
    const members = await this.teams.members(communityId);
    const admins = members.filter((m) => m.role === 'admin');
    if (role !== 'admin' && admins.length === 1 && admins[0]!.accountId === target) {
      throw err(HttpStatus.CONFLICT, 'last_admin', 'Die Community braucht mindestens einen Admin');
    }
    if (!(await this.teams.setRole(communityId, target, role))) {
      throw err(HttpStatus.NOT_FOUND, 'not_a_member', 'Kein Mitglied dieser Community');
    }
    await this.admin.audit({
      actorAccountId: accountId,
      action: 'community.role',
      targetType: 'account',
      targetId: target,
      data: { communityId, role },
    });
    return this.communityMembers(accountId, communityId);
  }

  /** XP-Korrektur durch Moderatoren, begrenzt und nur für Mitglieder der eigenen Community. */
  async moderateXp(
    accountId: string,
    communityId: string,
    target: string,
    amount: number,
    reason: string,
  ) {
    await this.requireRole(accountId, communityId, 'moderator');
    if (Math.abs(amount) > MODERATOR_XP_LIMIT) {
      throw err(
        HttpStatus.BAD_REQUEST,
        'xp_limit',
        `Moderatoren korrigieren höchstens ±${MODERATOR_XP_LIMIT} XP`,
      );
    }
    if (!(await this.teams.members(communityId)).some((m) => m.accountId === target)) {
      throw err(HttpStatus.NOT_FOUND, 'not_a_member', 'Kein Mitglied dieser Community');
    }
    const season = await this.seasons.current();
    const c = await this.characters.findForAccount(target, season.id);
    if (!c) throw err(HttpStatus.NOT_FOUND, 'no_character', 'Kein Charakter in dieser Season');
    const xp = Math.max(0, c.xp + amount);
    const level = levelFromXp(season.game, xp).level;
    await this.admin.setProgress(c.id, xp, level);
    await this.admin.audit({
      actorAccountId: accountId,
      action: 'community.xp',
      targetType: 'character',
      targetId: c.id,
      data: { communityId, amount, reason, xpBefore: c.xp, xpAfter: xp },
    });
    return this.communityMembers(accountId, communityId);
  }

  private async requireRole(accountId: string, communityId: string, min: 'moderator' | 'admin') {
    const role = (await this.teams.communities(accountId)).find((c) => c.id === communityId)?.role;
    const rank = { member: 0, moderator: 1, admin: 2 } as const;
    if (!role || rank[role] < rank[min]) {
      throw err(
        HttpStatus.FORBIDDEN,
        'not_community_staff',
        'Dafür fehlen dir die Rechte in dieser Community',
      );
    }
  }

  async joinCommunity(accountId: string, communityId: string): Promise<CommunityView[]> {
    const list = await this.teams.communities(accountId);
    if (!list.some((c) => c.id === communityId)) {
      throw err(HttpStatus.NOT_FOUND, 'community_not_found', 'Community nicht gefunden');
    }
    await this.teams.joinCommunity(communityId, accountId);
    return this.teams.communities(accountId);
  }

  async mine(accountId: string): Promise<TeamView[]> {
    const season = await this.seasons.current();
    return Promise.all(
      (await this.teams.teamsOf(accountId)).map((t) => this.view(season, t, accountId)),
    );
  }

  async create(
    accountId: string,
    input: { communityId: string; name: string; tag: string; logo: string },
  ) {
    if (!(await this.teams.isCommunityMember(input.communityId, accountId))) {
      throw err(HttpStatus.FORBIDDEN, 'not_in_community', 'Du gehörst dieser Community nicht an');
    }
    try {
      await this.teams.create({
        ...input,
        captainAccountId: accountId,
        joinCode: randomBytes(4).toString('hex').toUpperCase(),
        focus: 'threat',
        lineup2: [],
        lineup3: [],
      });
    } catch (error) {
      if (error instanceof TeamConflictError)
        throw err(HttpStatus.CONFLICT, error.code, error.message);
      throw error;
    }
    return this.mine(accountId);
  }

  async join(accountId: string, code: string): Promise<TeamView[]> {
    const t = await this.teams.findByCode(code);
    if (!t) throw err(HttpStatus.NOT_FOUND, 'team_not_found', 'Kein Team mit diesem Code');
    if (!(await this.teams.isCommunityMember(t.communityId, accountId))) {
      throw err(
        HttpStatus.FORBIDDEN,
        'not_in_community',
        'Tritt zuerst der Community des Teams bei',
      );
    }
    if (t.members.includes(accountId)) return this.mine(accountId);
    if (t.members.length >= TEAM_MAX_MEMBERS)
      throw err(HttpStatus.CONFLICT, 'team_full', 'Das Team ist voll');
    try {
      await this.teams.addMember(t, accountId);
    } catch (error) {
      if (error instanceof TeamConflictError)
        throw err(HttpStatus.CONFLICT, error.code, error.message);
      throw error;
    }
    return this.mine(accountId);
  }

  /** Austreten; der Kapitän übergibt an das dienstälteste Mitglied, das letzte löst das Team auf. */
  async leave(accountId: string, teamId: string): Promise<TeamView[]> {
    const t = await this.member(accountId, teamId);
    await this.removeFrom(t, accountId);
    return this.mine(accountId);
  }

  async kick(accountId: string, teamId: string, target: string): Promise<TeamView[]> {
    const t = await this.captain(accountId, teamId);
    if (target === accountId || !t.members.includes(target)) {
      throw err(HttpStatus.BAD_REQUEST, 'not_a_member', 'Kein anderes Mitglied');
    }
    await this.removeFrom(t, target);
    return this.mine(accountId);
  }

  async settings(
    accountId: string,
    teamId: string,
    input: { focus: TargetSelector; lineup2: string[]; lineup3: string[] },
  ) {
    const t = await this.captain(accountId, teamId);
    for (const [size, lineup] of [
      [2, input.lineup2],
      [3, input.lineup3],
    ] as const) {
      if (
        lineup.length > 0 &&
        (lineup.length !== size ||
          new Set(lineup).size !== size ||
          !lineup.every((id) => t.members.includes(id)))
      ) {
        throw err(
          HttpStatus.BAD_REQUEST,
          'invalid_lineup',
          `Die ${size}er-Aufstellung braucht ${size} verschiedene Mitglieder`,
        );
      }
    }
    await this.teams.update(teamId, input);
    return this.mine(accountId);
  }

  async search(query: string): Promise<TeamSummary[]> {
    const season = await this.seasons.current();
    const list = await this.teams.search(query.trim().slice(0, 30), 20);
    return Promise.all(
      list.map(async (t) => {
        const { isBot: _isBot, fighters: _fighters, ...summary } = await this.summary(season, t);
        return summary;
      }),
    );
  }

  /**
   * Gegnerische Tages-Teams (Spezifikation, Abschnitt 9): Jedes Team bekommt pro Tag eine kleine
   * Auswahl, nur diese lassen sich auf der Website fordern. Alle Mitglieder sehen dieselbe.
   */
  async opponents(accountId: string, teamId: string): Promise<TeamOpponentView[]> {
    const season = await this.seasons.current();
    const own = await this.member(accountId, teamId);
    const ids = await this.dailyOpponentTeams(season, own);
    const views: TeamOpponentView[] = [];
    for (const id of ids) {
      const t = await this.teams.find(id);
      if (!t) continue;
      const { fighters: _fighters, ...view } = await this.summary(season, t);
      views.push(view);
    }
    return views;
  }

  /**
   * Team-Kampf. Auf der Website nur gegen die gegnerischen Tages-Teams; `direct` (über Discord
   * angenommen) erlaubt jedes Team, `rewardOpponent` belohnt dann auch das annehmende Team.
   */
  async challenge(
    accountId: string,
    teamId: string,
    input: { opponentTeamId: string; size: 2 | 3; lineup: string[]; mode: 'rated' | 'friendly' },
    options: { direct?: boolean; rewardOpponent?: boolean } = {},
  ): Promise<TeamChallengeResponse> {
    const season = await this.seasons.current();
    const own = await this.member(accountId, teamId);
    if (input.opponentTeamId === teamId)
      throw err(HttpStatus.BAD_REQUEST, 'self_challenge', 'Nicht gegen das eigene Team');
    const opponent = await this.teams.find(input.opponentTeamId);
    if (!opponent) throw err(HttpStatus.NOT_FOUND, 'team_not_found', 'Gegner-Team nicht gefunden');
    if (!options.direct && !(await this.dailyOpponentTeams(season, own)).includes(opponent.id))
      throw err(
        HttpStatus.FORBIDDEN,
        'not_daily_opponent',
        'Nur gegnerische Tages-Teams; andere Teams über Discord mit Annahme',
      );

    if (
      input.lineup.length !== input.size ||
      new Set(input.lineup).size !== input.size ||
      !input.lineup.every((id) => own.members.includes(id))
    ) {
      throw err(HttpStatus.BAD_REQUEST, 'invalid_lineup', 'Ungültige Aufstellung');
    }
    const mine = await this.charactersOf(season, input.lineup);
    if (mine.some((c) => c === null))
      throw err(
        HttpStatus.BAD_REQUEST,
        'lineup_without_character',
        'Jemand in der Aufstellung hat keinen Charakter',
      );
    const ours = mine as CharacterRecord[];
    const theirs = await this.opponentLineup(season, opponent, input.size);

    const teams: CombatantSnapshot[][] = [
      ours.map((c) => ({ ...snapshotOf(season, c), focus: own.focus })),
      theirs.map((c) => ({ ...snapshotOf(season, c), focus: opponent.focus })),
    ];
    const seed = randomUUID();
    const result = simulateBattle({
      engineVersion: ENGINE_VERSION,
      configVersion: season.configVersion,
      seed,
      rules: season.battle,
      teams,
    });
    const won = result.winner === 0;
    const day = dayKey(this.clock.now(), this.env.GAME_TIMEZONE);
    const average = (list: readonly CharacterRecord[]) =>
      Math.round(list.reduce((s, c) => s + c.level, 0) / list.length);
    const median = await this.progression.median(season.id);
    const rewardOpponent = options.rewardOpponent === true;

    const response = await this.fights.lockedMany(
      [...ours, ...(rewardOpponent ? theirs : [])].map((c) => c.id),
      async (tx) => {
        const rewardsFor = async (
          side: readonly CharacterRecord[],
          other: readonly CharacterRecord[],
          otherTeamId: string,
          hasWon: boolean,
        ) => {
          const list = [];
          for (const c of side) {
            const counts = await tx.rewardCounts(c.id, day);
            const base = pvpReward(season.game, {
              mode: input.mode,
              won: hasWon,
              level: c.level,
              opponentLevel: average(other),
              rewardedToday: counts.today,
              rewardedVsOpponentToday: counts.byOpponent.get(otherTeamId) ?? 0,
              opponentIsBot: other.every((o) => o.isBot),
              testSeason: season.isTest,
            });
            list.push({ c, reward: this.progression.boost(season.game, base, c.level, median) });
          }
          return list;
        };
        const rewards = await rewardsFor(ours, theirs, opponent.id, won);
        const theirRewards = rewardOpponent
          ? await rewardsFor(theirs, ours, own.id, result.winner === 1)
          : null;
        const fightId = await tx.insert({
          seasonId: season.id,
          kind: input.mode === 'rated' ? 'team_rated' : 'team_friendly',
          seed,
          configVersion: season.configVersion,
          input: { rules: season.battle, teams },
          result,
          rewardDay: day,
          participants: [
            ...rewards.map(({ c, reward }, slot) => ({
              team: 0,
              slot,
              characterId: c.id,
              initiator: c.accountId === accountId,
              won,
              rewarded: reward.rewarded,
              xpAwarded: reward.xp,
              creditsAwarded: reward.credits,
              opponentCharacterId: null,
              opponentTeamId: opponent.id,
            })),
            ...theirs.map((c, slot) => {
              const reward = theirRewards?.[slot]?.reward;
              return {
                team: 1,
                slot,
                characterId: c.id,
                initiator: false,
                won: result.winner === 1,
                rewarded: reward?.rewarded ?? false,
                xpAwarded: reward?.xp ?? 0,
                creditsAwarded: reward?.credits ?? 0,
                opponentCharacterId: null,
                opponentTeamId: own.id,
              };
            }),
          ],
        });
        const book = async (list: typeof rewards): Promise<TeamChallengeReward[]> => {
          const summary: TeamChallengeReward[] = [];
          for (const { c, reward } of list) {
            let levelUp: number | null = null;
            if (reward.xp > 0) {
              const xp = c.xp + reward.xp;
              const level = Math.max(c.level, levelFromXp(season.game, xp).level);
              await tx.setProgress(c.id, xp, level);
              if (level > c.level) levelUp = level;
            }
            if (reward.credits > 0)
              await tx.rewardCredits(season.id, c.accountId, reward.credits, fightId);
            summary.push({
              name: c.name,
              xp: reward.xp,
              credits: reward.credits,
              limit: reward.limit,
              levelUp,
            });
          }
          return summary;
        };
        const out: TeamChallengeResponse = {
          fightId,
          won,
          draw: result.winner === null,
          rewards: await book(rewards),
        };
        if (theirRewards) out.opponentRewards = await book(theirRewards);
        return out;
      },
    );
    // Gewertete Team-Kämpfe schreiben das Team-Rating der Größe fort (Platzierung, Team-Liga)
    if (input.mode === 'rated')
      await this.ratings.recordTeams(
        season.id,
        input.size,
        own.id,
        opponent.id,
        result.winner === null ? null : (result.winner as 0 | 1),
      );
    return response;
  }

  /**
   * Aufstellung eines Teams als Kampf-Momentaufnahmen mit Team-Fokus (für den Lock der
   * Team-Liga): gespeicherte Standard-Aufstellung, sonst die stärksten Mitglieder. Null, wenn
   * das Team nicht genug Mitglieder mit Charakter hat.
   */
  async lineupSnapshots(teamId: string, size: 2 | 3): Promise<CombatantSnapshot[] | null> {
    const season = await this.seasons.current();
    const t = await this.teams.find(teamId);
    if (!t) return null;
    try {
      const lineup = await this.opponentLineup(season, t, size);
      return lineup.map((c) => ({ ...snapshotOf(season, c), focus: t.focus }));
    } catch {
      return null;
    }
  }

  /** Kapitän eines Teams (Account) oder null. */
  async captainOf(teamId: string): Promise<string | null> {
    return (await this.teams.find(teamId))?.captainAccountId ?? null;
  }

  /** Darf für das Team Herausforderungen annehmen: der Kapitän, ohne Kapitän jedes Mitglied. */
  async canAnswerFor(accountId: string, teamId: string): Promise<boolean> {
    const t = await this.teams.find(teamId);
    if (!t) return false;
    return t.captainAccountId ? t.captainAccountId === accountId : t.members.includes(accountId);
  }

  /** Kürzel zweier Teams (herausfordernd, gefordert) oder null, wenn eines fehlt. */
  async tags(
    ownTeamId: string,
    opponentTeamId: string,
  ): Promise<{ ownTag: string; opponentTag: string } | null> {
    const [a, b] = await Promise.all([this.teams.find(ownTeamId), this.teams.find(opponentTeamId)]);
    return a && b ? { ownTag: a.tag, opponentTag: b.tag } : null;
  }

  // --- intern ---------------------------------------------------------------

  /** Gespeicherte Tages-Teams oder, beim ersten Abruf des Tages, eine neue Auswahl. */
  private async dailyOpponentTeams(season: CurrentSeason, own: TeamRecord): Promise<string[]> {
    const day = dayKey(this.clock.now(), this.env.GAME_TIMEZONE);
    const stored = await this.pvp.dailyTeamOpponents(own.id, day);
    if (stored.length > 0) return stored;
    const ownChars = (await this.charactersOf(season, own.members)).filter(
      (c): c is CharacterRecord => c !== null,
    );
    const level = ownChars.length
      ? Math.round(ownChars.reduce((s, c) => s + c.level, 0) / ownChars.length)
      : 1;
    // Kandidaten: Teams mit mindestens zwei Mitgliedern mit Charakter (sonst kein 2v2)
    const candidates = [];
    for (const t of await this.teams.search('', 200)) {
      if (t.id === own.id) continue;
      const s = await this.summary(season, t);
      if (s.fighters >= 2) candidates.push({ id: t.id, level: s.averageLevel, isBot: s.isBot });
    }
    const ids = pickDailyOpponents(season.game.pvp, {
      level,
      candidates,
      seed: `team:${own.id}:${day}`,
      testSeason: season.isTest,
      count: season.game.pvp.dailyTeamOpponents,
    });
    return this.pvp.saveDailyTeamOpponents(own.id, day, ids);
  }

  private async summary(
    season: CurrentSeason,
    t: TeamRecord,
  ): Promise<TeamOpponentView & { fighters: number }> {
    const chars = (await this.charactersOf(season, t.members)).filter(
      (c): c is CharacterRecord => c !== null,
    );
    return {
      id: t.id,
      name: t.name,
      tag: t.tag,
      logo: t.logo as TeamSummary['logo'],
      community: t.communityName,
      members: t.members.length,
      averageLevel: chars.length
        ? Math.round(chars.reduce((s, c) => s + c.level, 0) / chars.length)
        : 0,
      isBot: chars.length > 0 && chars.every((c) => c.isBot),
      fighters: chars.length,
    };
  }

  /** Standard-Aufstellung des Gegners; fehlt sie, die stärksten Mitglieder mit Charakter. */
  private async opponentLineup(
    season: CurrentSeason,
    t: TeamRecord,
    size: 2 | 3,
  ): Promise<CharacterRecord[]> {
    const preset = size === 2 ? t.lineup2 : t.lineup3;
    const presetChars = (await this.charactersOf(season, preset)).filter(
      (c): c is CharacterRecord => c !== null,
    );
    if (presetChars.length === size) return presetChars;
    const all = (await this.charactersOf(season, t.members)).filter(
      (c): c is CharacterRecord => c !== null,
    );
    const pick = all.sort((a, b) => b.level - a.level).slice(0, size);
    if (pick.length < size) {
      throw err(
        HttpStatus.CONFLICT,
        'opponent_lineup_incomplete',
        `Das Gegner-Team hat keine ${size} Mitglieder mit Charakter`,
      );
    }
    return pick;
  }

  private charactersOf(season: CurrentSeason, accountIds: readonly string[]) {
    return Promise.all(accountIds.map((id) => this.characters.findForAccount(id, season.id)));
  }

  private async removeFrom(t: TeamRecord, accountId: string): Promise<void> {
    const rest = t.members.filter((m) => m !== accountId);
    if (rest.length === 0) return this.teams.remove(t.id);
    await this.teams.removeMember(t.id, accountId);
    await this.teams.update(t.id, {
      captainAccountId: t.captainAccountId === accountId ? rest[0]! : t.captainAccountId,
      lineup2: t.lineup2.filter((m) => m !== accountId),
      lineup3: t.lineup3.filter((m) => m !== accountId),
    });
  }

  private async member(accountId: string, teamId: string): Promise<TeamRecord> {
    const t = await this.teams.find(teamId);
    if (!t || !t.members.includes(accountId))
      throw err(HttpStatus.NOT_FOUND, 'team_not_found', 'Team nicht gefunden');
    return t;
  }

  private async captain(accountId: string, teamId: string): Promise<TeamRecord> {
    const t = await this.member(accountId, teamId);
    if (t.captainAccountId !== accountId)
      throw err(HttpStatus.FORBIDDEN, 'not_captain', 'Nur für den Kapitän');
    return t;
  }

  private async view(season: CurrentSeason, t: TeamRecord, accountId: string): Promise<TeamView> {
    const chars = await this.charactersOf(season, t.members);
    return {
      id: t.id,
      name: t.name,
      tag: t.tag,
      logo: t.logo as TeamView['logo'],
      community: { id: t.communityId, name: t.communityName },
      joinCode: t.joinCode,
      focus: t.focus,
      lineup2: t.lineup2,
      lineup3: t.lineup3,
      captain: t.captainAccountId === accountId,
      members: t.members.map((id, i) => ({
        accountId: id,
        captain: t.captainAccountId === id,
        character: chars[i]
          ? {
              id: chars[i]!.id,
              name: chars[i]!.name,
              level: chars[i]!.level,
              classId: chars[i]!.classId,
            }
          : null,
      })),
    };
  }
}
