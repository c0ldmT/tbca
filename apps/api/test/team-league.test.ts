import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { TeamLeagueService } from '../src/league/team-league.service.js';
import { createTestApp, login, WEB_ORIGIN, type TestApp } from './helpers.js';

type Auth = { cookie: string; csrfToken: string };
let t: TestApp;
let players: Auth[];
const DEV = '01933b5e-0000-7000-8000-00000000c001';
const HOUR = 60 * 60 * 1000;

function call(as: Auth, method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown) {
  return t.app.inject({
    method,
    url,
    cookies: { tbca_session: as.cookie },
    headers: { 'x-csrf-token': as.csrfToken, origin: WEB_ORIGIN },
    ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
  });
}

const tick = () =>
  t.app.inject({
    method: 'POST',
    url: '/api/internal/jobs/league-tick',
    headers: { authorization: `Bearer ${'b'.repeat(40)}` },
  });

beforeEach(async () => {
  t = await createTestApp();
  players = [];
  const classes = ['bruiser', 'gunner', 'medtech', 'netrunner'];
  for (let i = 0; i < 8; i++) {
    const p = await login(t, `20${i}`);
    players.push(p);
    await call(p, 'POST', '/api/characters', { name: `Kader${i}`, classId: classes[i % 4] });
    await call(p, 'POST', `/api/communities/${DEV}/join`);
  }
});

afterEach(async () => {
  await t.app.close();
});

async function makeTeam(captain: number, members: number[], name: string, tag: string) {
  const team = (
    await call(players[captain]!, 'POST', '/api/teams', {
      communityId: DEV,
      name,
      tag,
      logo: 'wolf',
    })
  ).json()[0];
  for (const m of members)
    await call(players[m]!, 'POST', '/api/teams/join', { code: team.joinCode });
  return team.id as string;
}

/** Platziert und meldet ein Team direkt an (ohne fünf Kämpfe). */
function place(teamId: string, rating: number) {
  t.teamLeague.ratingRows.push({
    teamId,
    seasonId: t.seasons.current!.id,
    size: 2,
    rating,
    rd: 100,
    volatility: 0.06,
    games: 5,
    wins: 3,
    losses: 2,
    draws: 0,
    leagueJoined: true,
  });
}

describe('Team-Rating', () => {
  it('schreibt das Rating beider Teams je Größe aus gewerteten Team-Kämpfen fort', async () => {
    const a = await makeTeam(0, [1], 'Chrome Wolves', 'CHW');
    const b = await makeTeam(2, [3], 'Neon Saints', 'NEON');
    const fight = (opponent: string, mode: 'rated' | 'friendly') =>
      call(players[0]!, 'POST', `/api/teams/${a}/challenge`, {
        opponentTeamId: opponent,
        size: 2,
        lineup: [...t.accounts.accounts.keys()].slice(0, 2),
        mode,
      });
    expect((await fight(b, 'friendly')).statusCode).toBe(201);
    expect(t.teamLeague.ratingRows).toHaveLength(0);
    expect((await fight(b, 'rated')).statusCode).toBe(201);
    const rows = t.teamLeague.ratingRows.filter((r) => r.size === 2);
    expect(rows.map((r) => r.teamId).sort()).toEqual([a, b].sort());
    expect(rows.every((r) => r.games === 1)).toBe(true);
    expect(rows[0]!.rating).not.toBe(rows[1]!.rating);

    const view = (await call(players[1]!, 'GET', `/api/teams/${a}/league?size=2`)).json();
    expect(view).toMatchObject({ size: 2, captain: false, joined: false });
    expect(view.rating).toMatchObject({ games: 1, placementLeft: 4 });
  });

  it('lässt nur den Kapitän anmelden', async () => {
    const a = await makeTeam(0, [1], 'Chrome Wolves', 'CHW');
    const denied = await call(players[1]!, 'POST', `/api/teams/${a}/league`, {
      size: 2,
      joined: true,
    });
    expect(denied.json().code).toBe('not_captain');
    const ok = (
      await call(players[0]!, 'POST', `/api/teams/${a}/league`, { size: 3, joined: true })
    ).json();
    expect(ok).toMatchObject({ size: 3, joined: true, captain: true });
    expect((await call(players[0]!, 'GET', `/api/teams/${a}/league?size=4`)).statusCode).toBe(400);
  });
});

describe('Team-Liga', () => {
  it('teilt Teams ein, friert Aufstellungen ein und spielt den Spieltag', async () => {
    const ids = [
      await makeTeam(0, [1], 'Chrome Wolves', 'CHW'),
      await makeTeam(2, [3], 'Neon Saints', 'NEON'),
      await makeTeam(4, [5], 'Skull Grid', 'SKG'),
      // Nur ein Mitglied: zum Lock nicht antrittsfähig
      await makeTeam(6, [], 'Lone Wolf', 'LONE'),
    ];
    ids.forEach((id, i) => place(id, 1600 - i * 10));

    const started = (await tick()).json();
    expect(started.teams).toMatchObject({ cyclesStarted: 1 });
    const view = (await call(players[0]!, 'GET', `/api/teams/${ids[0]}/league?size=2`)).json();
    expect(view.division.table).toHaveLength(4);
    expect(view.division.matches).toHaveLength(6);
    expect(view.next.playAt).toBe('2026-11-12T19:00:00.000Z');

    t.time.tick(7 * HOUR + 30 * 60_000); // 19:30 – Lock
    expect((await tick()).json().teams.locked).toBe(2);
    const locked = t.teamLeague.matchRows.filter((m) => m.status === 'locked');
    const withLone = locked.find((m) => m.aTeamId === ids[3] || m.bTeamId === ids[3])!;
    expect(withLone.snapshots!.some((s) => s.length === 0)).toBe(true);
    const full = locked.find((m) => m !== withLone)!;
    expect(full.snapshots!.map((s) => s.length)).toEqual([2, 2]);
    expect(full.snapshots![0]![0]!.focus).toBe('threat');

    t.time.tick(HOUR); // 20:30 – Spieltag
    expect((await tick()).json().teams.played).toBe(2);
    const fights = t.fights.fights.filter((f) => f.kind === 'team_league');
    expect(fights).toHaveLength(1); // die andere Paarung kampflos
    expect(fights[0]!.participants.every((p) => !p.rewarded)).toBe(true);
    const walkover = t.teamLeague.matchRows.find((m) => m.id === withLone.id)!;
    expect(walkover.winnerTeamId).not.toBe(ids[3]);
    expect(walkover.fightId).toBeNull();

    // Team-Ratings der Kämpfenden sind fortgeschrieben
    expect(t.teamLeague.ratingRows.filter((r) => r.games === 6)).toHaveLength(2);

    // Bis zum Zyklusende vorspulen: Plätze vergeben, nächster Zyklus startet
    t.time.tick(3 * 24 * HOUR);
    const rest = (await tick()).json().teams;
    expect(rest.cyclesFinished).toBe(1);
    expect(rest.cyclesStarted).toBe(1);
    const places = t.teamLeague.memberRows
      .filter((m) => m.cycleId === t.teamLeague.cycles[0]!.id)
      .map((m) => m.place)
      .sort();
    expect(places).toEqual([1, 2, 3, 4]);

    // Ankündigungen für die Community der Teams: drei Spieltage, dann das Abschlussranking …
    const news = await t.app
      .get(TeamLeagueService)
      .news(DEV, 0, new Date('2026-11-16T00:00:00Z').getTime());
    // … und der erste Spieltag des schon begonnenen nächsten Zyklus
    expect(news.map((n) => [n.kind, n.team, n.cycle])).toEqual([
      ['matchday', 2, 1],
      ['matchday', 2, 1],
      ['matchday', 2, 1],
      ['cycle_end', 2, 1],
      ['matchday', 2, 2],
    ]);
    const first = news[0]!;
    expect(first.kind === 'matchday' && first.results).toHaveLength(2);
    expect(first.kind === 'matchday' && first.results[0]!.a).toMatch(/^\[[A-Z]+\] /);
    const end = news[3]!;
    expect(end.kind === 'cycle_end' && end.rows.map((r) => r.place)).toEqual([1, 2, 3, 4]);
    // Andere Communities hören nichts davon
    expect(await t.app.get(TeamLeagueService).news('other', 0, Date.now() * 2)).toEqual([]);

    const board = (
      await call(players[0]!, 'GET', '/api/league/teams/leaderboard?size=2&limit=10')
    ).json();
    expect(board.map((b: { tag: string }) => b.tag)).toContain('CHW');
    expect(board[0]).toMatchObject({ place: 1, community: expect.any(String) });
  });
});
