import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  ENGINE_VERSION,
  levelFromXp,
  pvpReward,
  simulateBattle,
  standings,
  type Clock,
  type CombatantSnapshot,
  type StandingRow,
} from '@tbca/game-core';
import type {
  ChallengeResponse,
  DiscordLeagueNewsItem,
  LeaderboardEntry,
  LeagueCharacterRef,
  LeagueDivisionView,
  LeagueMatchView,
  LeagueTickResult,
  LeagueView,
} from '@tbca/shared';

import { snapshotOf } from '../character/character.service.js';
import type { CharacterRecord, CharacterRepository } from '../character/types.js';
import { ApiError } from '../common/api-error.js';
import type { Env } from '../config/env.js';
import { dayKey } from '../fight/day.js';
import { FightService } from '../fight/fight.service.js';
import type { FightRepository } from '../fight/types.js';
import { SeasonService, type CurrentSeason } from '../game/season.js';
import { ProgressionService } from '../progression/progression.service.js';
import {
  CHARACTER_REPOSITORY,
  CLOCK,
  ENV,
  FIGHT_REPOSITORY,
  LEAGUE_REPOSITORY,
} from '../tokens.js';
import { GLICKO_START } from './glicko2.js';
import { planCycle } from './schedule.js';
import { TeamLeagueService } from './team-league.service.js';
import { RatingService } from './rating.service.js';
import type {
  CycleRecord,
  LeagueRepository,
  MatchRecord,
  MemberRecord,
  NewMatch,
  RatingRecord,
} from './types.js';

/** Höchstzahl an Terminen je Durchlauf, damit ein langes Vorspulen nicht endlos läuft. */
const MAX_EVENTS_PER_TICK = 500;

/**
 * Liga (Spezifikation, Abschnitt 9): Anmeldung nach der Platzierung, Zyklen mit Divisionen und
 * Round Robin, Lock vor dem Spieltag, Kämpfe zum Spieltag, Auf- und Abstieg.
 *
 * Der Worker ruft `tick()` regelmäßig auf. Ein Durchlauf arbeitet alle fälligen Termine nach
 * Spielzeit in Reihenfolge ab – auch nach dem Vorspulen einer Test-Season, dann Spieltag für
 * Spieltag und Zyklus für Zyklus.
 */
@Injectable()
export class LeagueService {
  /** Ein Durchlauf zur Zeit (Worker und Admin-Knopf im selben Prozess). */
  private running: Promise<LeagueTickResult> | null = null;

  constructor(
    @Inject(LEAGUE_REPOSITORY) private readonly repo: LeagueRepository,
    @Inject(CHARACTER_REPOSITORY) private readonly characters: CharacterRepository,
    @Inject(FIGHT_REPOSITORY) private readonly fights: FightRepository,
    @Inject(FightService) private readonly fightService: FightService,
    @Inject(RatingService) private readonly ratings: RatingService,
    @Inject(SeasonService) private readonly seasons: SeasonService,
    @Inject(ProgressionService) private readonly progression: ProgressionService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ENV) private readonly env: Env,
    @Inject(TeamLeagueService) private readonly teamLeague: TeamLeagueService,
  ) {}

  // --- Spieler ----------------------------------------------------------------

  async view(accountId: string): Promise<LeagueView> {
    const { season, me } = await this.mine(accountId);
    const rules = season.game.league;
    const rating = (await this.repo.ratings([me.id])).get(me.id) ?? null;
    const cycle =
      (await this.repo.activeCycle(season.id)) ?? (await this.repo.lastCycle(season.id));
    let division: LeagueView['division'] = null;
    let next: LeagueView['next'] = null;
    if (cycle) {
      const members = await this.repo.members(cycle.id);
      const mine = members.find((m) => m.characterId === me.id);
      if (mine) {
        const matches = await this.repo.matches(cycle.id);
        division = await this.divisionView(season, cycle, members, matches, mine.division, me.id);
        const upcoming = matches
          .filter(
            (m) =>
              (m.status === 'scheduled' || m.status === 'locked') &&
              (m.aCharacterId === me.id || m.bCharacterId === me.id),
          )
          .sort((x, y) => x.playAt.getTime() - y.playAt.getTime())[0];
        if (upcoming)
          next = {
            matchday: upcoming.matchday,
            lockAt: upcoming.lockAt.toISOString(),
            playAt: upcoming.playAt.toISOString(),
            locked: upcoming.status === 'locked',
          };
      }
    }
    return {
      rating: rating ? ratingView(rating, rules.placementGames) : null,
      joined: rating?.leagueJoined ?? false,
      cycle: cycle ? cycleView(cycle) : null,
      division,
      next,
      rules: {
        divisionSize: rules.divisionSize,
        promote: rules.promote,
        relegate: rules.relegate,
        lockMinutes: rules.lockMinutes,
        placementGames: rules.placementGames,
        matchday: `${String(rules.matchdayHour).padStart(2, '0')}:${String(rules.matchdayMinute).padStart(2, '0')}`,
        points: { ...rules.points },
      },
    };
  }

  /** Eine beliebige Division des laufenden (oder zuletzt beendeten) Zyklus. */
  async division(accountId: string, index: number): Promise<LeagueDivisionView> {
    const season = await this.seasons.current();
    const me = await this.characters.findForAccount(accountId, season.id);
    const cycle =
      (await this.repo.activeCycle(season.id)) ?? (await this.repo.lastCycle(season.id));
    const members = cycle ? await this.repo.members(cycle.id) : [];
    if (!cycle || !members.some((m) => m.division === index)) {
      throw new ApiError(HttpStatus.NOT_FOUND, 'division_not_found', 'Division nicht gefunden');
    }
    const matches = await this.repo.matches(cycle.id);
    return {
      cycle: cycleView(cycle),
      division: await this.divisionView(season, cycle, members, matches, index, me?.id ?? null),
    };
  }

  private async divisionView(
    season: CurrentSeason,
    cycle: CycleRecord,
    members: MemberRecord[],
    allMatches: MatchRecord[],
    index: number,
    meId: string | null,
  ): Promise<NonNullable<LeagueView['division']>> {
    const count = Math.max(...members.map((m) => m.division)) + 1;
    const inDivision = members.filter((m) => m.division === index);
    const matches = allMatches.filter((m) => m.division === index);
    const refs = await this.refs(inDivision.map((m) => m.characterId));
    const table = this.table(season, cycle, inDivision, matches, index, count);
    return {
      index,
      count,
      table: table
        .filter((row) => refs.has(row.characterId))
        .map((row) => ({
          ...refs.get(row.characterId)!,
          place: row.place,
          played: row.played,
          wins: row.wins,
          draws: row.draws,
          losses: row.losses,
          points: row.points,
          movement: row.movement,
          me: row.characterId === meId,
        })),
      matches: matches.map((m) => matchView(m, refs)),
    };
  }

  async join(accountId: string, joined: boolean): Promise<LeagueView> {
    const { season, me } = await this.mine(accountId);
    await this.repo.setJoined(season.id, me.id, joined);
    return this.view(accountId);
  }

  /**
   * Platzierungskampf: ein gewerteter Kampf gegen einen Gegner nahe am eigenen Level, automatisch
   * gewählt. Er zählt wie jede gewertete Herausforderung (Belohnung, Tageslimit, Rating).
   */
  async placement(accountId: string): Promise<ChallengeResponse> {
    const { season, me } = await this.mine(accountId);
    const rating = (await this.repo.ratings([me.id])).get(me.id);
    if ((rating?.games ?? 0) >= season.game.league.placementGames) {
      throw new ApiError(HttpStatus.CONFLICT, 'already_placed', 'Platzierung abgeschlossen');
    }
    const candidates = await this.characters.search(season.id, '', accountId, me.level, 10);
    if (candidates.length === 0) {
      throw new ApiError(HttpStatus.CONFLICT, 'no_opponent', 'Kein Gegner gefunden');
    }
    // Nächster Level zuerst; bei Gleichstand reihum nach Zahl der bisherigen Kämpfe
    const sorted = [...candidates].sort(
      (a, b) => Math.abs(a.level - me.level) - Math.abs(b.level - me.level),
    );
    const pick = sorted[(rating?.games ?? 0) % Math.min(3, sorted.length)]!;
    return this.fightService.challenge(accountId, { opponentId: pick.id, mode: 'rated' });
  }

  async leaderboard(
    accountId: string | null,
    scope: 'global' | 'community',
    limit: number,
  ): Promise<LeaderboardEntry[]> {
    const season = await this.seasons.current();
    const me = accountId ? await this.characters.findForAccount(accountId, season.id) : null;
    if (scope === 'community' && !accountId) {
      throw new ApiError(HttpStatus.UNAUTHORIZED, 'unauthorized', 'Anmeldung nötig');
    }
    const rows = await this.repo.leaderboard(season.id, {
      minGames: season.game.league.placementGames,
      limit,
      homeOfAccount: scope === 'community' ? accountId : null,
    });
    return rows.map((r, i) => ({
      id: r.characterId,
      name: r.name,
      classId: r.classId,
      level: r.level,
      place: i + 1,
      rating: Math.round(r.rating),
      rd: Math.round(r.rd),
      games: r.games,
      wins: r.wins,
      losses: r.losses,
      draws: r.draws,
      isBot: r.isBot,
      me: r.characterId === me?.id,
    }));
  }

  /**
   * Ankündigungen für eine Community: gespielte Spieltage und beendete Zyklen im Zeitraum
   * (`after`, `until`], nur mit Paarungen und Plätzen von Spielern dieser Heimat-Community.
   */
  async news(communityId: string, after: number, until: number): Promise<DiscordLeagueNewsItem[]> {
    const season = await this.seasons.current();
    const items: DiscordLeagueNewsItem[] = [];
    const inRange = (d: Date | null) => !!d && d.getTime() > after && d.getTime() <= until;
    // Älterer Zyklus zuerst, damit die Reihenfolge der Ankündigungen stimmt
    for (const cycle of (await this.repo.recentCycles(season.id, 2)).reverse()) {
      const members = await this.repo.members(cycle.id);
      const home = await this.repo.homeMembers(
        communityId,
        members.map((m) => m.characterId),
      );
      if (home.size === 0) continue;
      const matches = await this.repo.matches(cycle.id);
      const refs = await this.refs(members.map((m) => m.characterId));
      const name = (id: string | null) => (id ? (refs.get(id)?.name ?? '—') : '—');
      const days = [...new Set(matches.map((m) => m.matchday))].sort((a, b) => a - b);
      for (const day of days) {
        const ofDay = matches.filter((m) => m.matchday === day && m.status !== 'bye');
        if (ofDay.length === 0 || ofDay.some((m) => m.status !== 'played')) continue;
        if (!inRange(ofDay[0]!.playAt)) continue;
        const results = ofDay
          .filter(
            (m) =>
              (m.aCharacterId && home.has(m.aCharacterId)) ||
              (m.bCharacterId && home.has(m.bCharacterId)),
          )
          .map((m) => ({
            a: name(m.aCharacterId),
            b: name(m.bCharacterId),
            winner: m.draw ? null : m.winnerCharacterId ? name(m.winnerCharacterId) : null,
            url: m.fightId ? `${this.env.WEB_ORIGIN}/replay/${m.fightId}` : null,
          }));
        if (results.length)
          items.push({
            kind: 'matchday',
            cycle: cycle.number,
            matchday: day,
            playAt: ofDay[0]!.playAt.toISOString(),
            results,
          });
      }
      if (cycle.status === 'finished' && inRange(cycle.finishedAt)) {
        const rows = members
          .filter((m) => home.has(m.characterId) && m.place !== null)
          .sort((x, y) => x.division - y.division || x.place! - y.place!)
          .map((m) => ({
            name: name(m.characterId),
            division: m.division + 1,
            place: m.place!,
            movement: m.movement ?? 'stay',
          }));
        if (rows.length) items.push({ kind: 'cycle_end', cycle: cycle.number, rows });
      }
    }
    return items;
  }

  // --- Ablauf -----------------------------------------------------------------

  /** Arbeitet alle fälligen Termine ab (Worker-Job „league-tick“). */
  tick(): Promise<LeagueTickResult> {
    this.running ??= this.runTick().finally(() => (this.running = null));
    return this.running;
  }

  private async runTick(): Promise<LeagueTickResult> {
    const season = await this.seasons.current();
    const now = this.clock.now();
    const result: LeagueTickResult = { locked: 0, played: 0, cyclesStarted: 0, cyclesFinished: 0 };
    // Zeitpunkt des zuletzt abgearbeiteten Termins: ein neuer Zyklus schließt daran an
    let cursor: number | null = null;
    for (let i = 0; i < MAX_EVENTS_PER_TICK; i++) {
      const cycle = await this.repo.activeCycle(season.id);
      if (!cycle) {
        const started = await this.startCycle(season, cursor ?? now);
        if (!started) break;
        result.cyclesStarted++;
        continue;
      }
      const event = await this.repo.nextEvent(cycle.id);
      if (!event) {
        await this.finishCycle(season, cycle);
        result.cyclesFinished++;
        cursor = cycle.endsAt.getTime();
        continue;
      }
      if (event.at.getTime() > now) break;
      cursor = event.at.getTime();
      if (event.kind === 'lock') result.locked += await this.lockDue(season, cycle, event.at);
      else result.played += await this.playDue(season, cycle, event.at);
    }
    // Team-Liga im selben Durchlauf (2v2 und 3v3)
    result.teams = await this.teamLeague.tick();
    return result;
  }

  private async startCycle(season: CurrentSeason, base: number): Promise<CycleRecord | null> {
    const rules = season.game.league;
    const entrants = await this.repo.entrants(season.id, rules.placementGames);
    const last = await this.repo.lastCycle(season.id);
    const previous = new Map(
      (last ? await this.repo.members(last.id) : []).map((m) => [m.characterId, m]),
    );
    const plan = planCycle(
      rules,
      entrants.map((e) => ({ id: e.characterId, rating: e.rating })),
      (id) => {
        const p = previous.get(id);
        return p && p.place !== null
          ? { division: p.division, place: p.place, movement: p.movement ?? 'stay' }
          : null;
      },
      base,
      this.env.GAME_TIMEZONE,
    );
    if (!plan) return null;
    const rating = new Map(entrants.map((e) => [e.characterId, e.rating]));
    return this.repo.createCycle({
      seasonId: season.id,
      number: (last?.number ?? 0) + 1,
      startsAt: plan.startsAt,
      endsAt: plan.endsAt,
      members: plan.divisions.flatMap((ids, division) =>
        ids.map((characterId) => ({
          characterId,
          division,
          ratingAtStart: rating.get(characterId) ?? GLICKO_START.rating,
        })),
      ),
      matches: plan.pairings.map((p): NewMatch => ({
        division: p.division,
        matchday: p.matchday,
        lockAt: p.lockAt,
        playAt: p.playAt,
        aCharacterId: p.a,
        bCharacterId: p.b,
        status: p.b === null ? 'bye' : 'scheduled',
      })),
    });
  }

  /** Lock: Momentaufnahmen beider Seiten einfrieren. */
  private async lockDue(season: CurrentSeason, cycle: CycleRecord, at: Date): Promise<number> {
    const due = (await this.repo.matches(cycle.id)).filter(
      (m) => m.status === 'scheduled' && m.lockAt.getTime() <= at.getTime(),
    );
    const ids = [...new Set(due.flatMap((m) => [m.aCharacterId, m.bCharacterId]))].filter(
      (id): id is string => id !== null,
    );
    const snapshots = new Map<string, CombatantSnapshot>();
    for (const id of ids) {
      const record = await this.characters.findById(id);
      if (record) snapshots.set(id, snapshotOf(season, record));
    }
    await this.repo.lockMatches(
      due.map((m) => ({
        id: m.id,
        snapshots: [m.aCharacterId, m.bCharacterId]
          .map((id) => (id ? snapshots.get(id) : undefined))
          .filter((s): s is CombatantSnapshot => s !== undefined),
      })),
    );
    return due.length;
  }

  /** Spieltag: gesperrte Paarungen auskämpfen, belohnen und das Rating fortschreiben. */
  private async playDue(season: CurrentSeason, cycle: CycleRecord, at: Date): Promise<number> {
    const due = (await this.repo.matches(cycle.id)).filter(
      (m) => m.status === 'locked' && m.playAt.getTime() <= at.getTime(),
    );
    for (const match of due) await this.play(season, match, at);
    return due.length;
  }

  private async play(season: CurrentSeason, match: MatchRecord, at: Date): Promise<void> {
    const [sa, sb] = [match.aCharacterId, match.bCharacterId].map((id) =>
      id ? match.snapshots?.find((s) => s.id === id) : undefined,
    );
    // Gelöschter Charakter: kampflos für die andere Seite
    if (!sa || !sb) {
      const winner = sa ? match.aCharacterId : sb ? match.bCharacterId : null;
      await this.repo.finishMatch(match.id, {
        fightId: null,
        winnerCharacterId: winner,
        draw: false,
      });
      return;
    }
    const a = await this.characters.findById(sa.id);
    const b = await this.characters.findById(sb.id);
    if (!a || !b) {
      await this.repo.finishMatch(match.id, {
        fightId: null,
        winnerCharacterId: a ? a.id : b ? b.id : null,
        draw: false,
      });
      return;
    }
    const result = simulateBattle({
      engineVersion: ENGINE_VERSION,
      configVersion: season.configVersion,
      seed: match.id,
      rules: season.battle,
      teams: [[sa], [sb]],
    });
    const day = dayKey(at.getTime(), this.env.GAME_TIMEZONE);
    const median = await this.progression.median(season.id);
    const reward = (me: CharacterRecord, opponent: CharacterRecord, won: boolean) =>
      this.progression.boost(
        season.game,
        pvpReward(season.game, {
          mode: 'rated',
          won,
          level: me.level,
          opponentLevel: opponent.level,
          // Liga-Kämpfe zählen nicht gegen das Tageslimit der Herausforderungen
          rewardedToday: 0,
          rewardedVsOpponentToday: 0,
          opponentIsBot: opponent.isBot ?? false,
          testSeason: season.isTest,
        }),
        me.level,
        median,
      );
    const ra = reward(a, b, result.winner === 0);
    const rb = reward(b, a, result.winner === 1);

    const fightId = await this.fights.lockedMany([a.id, b.id], async (tx) => {
      const id = await tx.insert({
        seasonId: season.id,
        kind: 'league',
        seed: match.id,
        configVersion: season.configVersion,
        input: { rules: season.battle, teams: [[sa], [sb]] },
        result,
        rewardDay: day,
        participants: [
          participant(0, a.id, b.id, result.winner === 0, ra),
          participant(1, b.id, a.id, result.winner === 1, rb),
        ],
      });
      for (const [record, r] of [
        [a, ra],
        [b, rb],
      ] as const) {
        if (r.credits > 0) await tx.rewardCredits(season.id, record.accountId, r.credits, id);
        if (r.xp > 0) {
          // Aktuellen Stand lesen: zwischen Lock und Spieltag kann XP dazugekommen sein
          const fresh = (await this.characters.findById(record.id)) ?? record;
          const xp = fresh.xp + r.xp;
          await tx.setProgress(
            record.id,
            xp,
            Math.max(fresh.level, levelFromXp(season.game, xp).level),
          );
        }
      }
      return id;
    });
    await this.repo.finishMatch(match.id, {
      fightId,
      winnerCharacterId: result.winner === 0 ? a.id : result.winner === 1 ? b.id : null,
      draw: result.winner === null,
    });
    await this.ratings.record(
      season.id,
      a.id,
      b.id,
      result.winner === null ? null : (result.winner as 0 | 1),
    );
  }

  private async finishCycle(season: CurrentSeason, cycle: CycleRecord): Promise<void> {
    const members = await this.repo.members(cycle.id);
    const matches = await this.repo.matches(cycle.id);
    const count = members.length ? Math.max(...members.map((m) => m.division)) + 1 : 0;
    const rows: { characterId: string; place: number; movement: 'up' | 'down' | 'stay' }[] = [];
    for (let d = 0; d < count; d++) {
      const table = this.table(
        season,
        cycle,
        members.filter((m) => m.division === d),
        matches.filter((m) => m.division === d),
        d,
        count,
      );
      for (const row of table)
        rows.push({ characterId: row.characterId, place: row.place, movement: row.movement });
    }
    await this.repo.finishCycle(cycle.id, cycle.endsAt, rows);
  }

  private table(
    season: CurrentSeason,
    _cycle: CycleRecord,
    members: { characterId: string; ratingAtStart: number }[],
    matches: MatchRecord[],
    division: number,
    divisions: number,
  ): StandingRow[] {
    return standings(season.game.league, {
      members: members.map((m) => ({ characterId: m.characterId, rating: m.ratingAtStart })),
      results: matches
        .filter((m) => m.status === 'played' && m.aCharacterId && m.bCharacterId)
        .map((m) => ({
          a: m.aCharacterId!,
          b: m.bCharacterId!,
          winner: m.draw ? null : m.winnerCharacterId,
        })),
      division,
      divisions,
    });
  }

  // --- Hilfen -----------------------------------------------------------------

  private async refs(ids: readonly string[]): Promise<Map<string, LeagueCharacterRef>> {
    const out = new Map<string, LeagueCharacterRef>();
    for (const id of ids) {
      const c = await this.characters.findById(id);
      if (c) out.set(id, { id: c.id, name: c.name, classId: c.classId, level: c.level });
    }
    return out;
  }

  private async mine(accountId: string): Promise<{ season: CurrentSeason; me: CharacterRecord }> {
    const season = await this.seasons.current();
    const me = await this.characters.findForAccount(accountId, season.id);
    if (!me) {
      throw new ApiError(HttpStatus.NOT_FOUND, 'no_character', 'Kein Charakter in dieser Season');
    }
    return { season, me };
  }
}

function participant(
  team: number,
  characterId: string,
  opponentCharacterId: string,
  won: boolean,
  reward: { xp: number; credits: number },
) {
  return {
    team,
    slot: 0,
    characterId,
    initiator: team === 0,
    won,
    // Liga-Kämpfe zählen nicht für das Tageslimit
    rewarded: false,
    xpAwarded: reward.xp,
    creditsAwarded: reward.credits,
    opponentCharacterId,
  };
}

function cycleView(cycle: CycleRecord): NonNullable<LeagueView['cycle']> {
  return {
    id: cycle.id,
    number: cycle.number,
    status: cycle.status,
    startsAt: cycle.startsAt.toISOString(),
    endsAt: cycle.endsAt.toISOString(),
  };
}

function ratingView(r: RatingRecord, placementGames: number) {
  return {
    rating: Math.round(r.rating),
    rd: Math.round(r.rd),
    games: r.games,
    wins: r.wins,
    losses: r.losses,
    draws: r.draws,
    placementLeft: Math.max(0, placementGames - r.games),
  };
}

function matchView(m: MatchRecord, refs: Map<string, LeagueCharacterRef>): LeagueMatchView {
  return {
    id: m.id,
    matchday: m.matchday,
    lockAt: m.lockAt.toISOString(),
    playAt: m.playAt.toISOString(),
    status: m.status,
    a: m.aCharacterId ? (refs.get(m.aCharacterId) ?? null) : null,
    b: m.bCharacterId ? (refs.get(m.bCharacterId) ?? null) : null,
    winnerId: m.winnerCharacterId,
    draw: m.draw,
    fightId: m.fightId,
  };
}
