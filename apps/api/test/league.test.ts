import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createTestApp, login, WEB_ORIGIN, type TestApp } from './helpers.js';

let t: TestApp;
type Auth = { cookie: string; csrfToken: string };
let alice: Auth;
let aliceId: string;
const HOUR = 60 * 60 * 1000;

function call(as: Auth, method: 'GET' | 'POST', url: string, payload?: unknown) {
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

/** Weitere Charaktere, schon platziert und angemeldet. */
function addPlayers(n: number) {
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const id = `01933b5e-0000-7000-8000-0000000001${String(i).padStart(2, '0')}`;
    t.characters.records.push({
      id,
      accountId: `acc-${i}`,
      seasonId: t.seasons.current!.id,
      name: `Player${i}`,
      classId: (['bruiser', 'gunner', 'netrunner', 'medtech'] as const)[i % 4]!,
      level: 5,
      xp: 0,
      allocated: { str: 2, dex: 2, int: 2, con: 2 },
      loadouts: {},
    });
    t.league.ratingRows.set(id, {
      characterId: id,
      seasonId: t.seasons.current!.id,
      rating: 1600 - i * 20,
      rd: 120,
      volatility: 0.06,
      games: 5,
      wins: 3,
      losses: 2,
      draws: 0,
      leagueJoined: true,
    });
    ids.push(id);
  }
  return ids;
}

beforeEach(async () => {
  t = await createTestApp();
  alice = await login(t, '1001');
  aliceId = (
    await call(alice, 'POST', '/api/characters', { name: 'Alice', classId: 'gunner' })
  ).json().id;
});

afterEach(async () => {
  await t.app.close();
});

describe('Rating und Platzierung', () => {
  it('startet ohne Rating und platziert über gewertete Kämpfe', async () => {
    const before = (await call(alice, 'GET', '/api/league')).json();
    expect(before).toMatchObject({ rating: null, joined: false, cycle: null, division: null });
    expect(before.rules).toMatchObject({ placementGames: 5, matchday: '20:00', lockMinutes: 60 });

    addPlayers(3);
    const fight = await call(alice, 'POST', '/api/league/placement');
    expect(fight.statusCode).toBe(201);
    const after = (await call(alice, 'GET', '/api/league')).json();
    expect(after.rating).toMatchObject({ games: 1, placementLeft: 4 });
    expect(after.rating.rating).not.toBe(1500);
    // Auch der Gegner hat ein fortgeschriebenes Rating
    const opponent = t.fights.fights.find((f) => f.id === fight.json().fightId)!.participants[1]!;
    expect(t.league.ratingRows.get(opponent.characterId!)!.games).toBe(6);
  });

  it('schreibt das Rating nur bei gewerteten Herausforderungen fort', async () => {
    const [bob] = addPlayers(1);
    await call(alice, 'POST', '/api/pvp/challenges', { opponentId: bob, mode: 'friendly' });
    expect(t.league.ratingRows.has(aliceId)).toBe(false);
    await call(alice, 'POST', '/api/pvp/challenges', { opponentId: bob, mode: 'rated' });
    expect(t.league.ratingRows.get(aliceId)!.games).toBe(1);
  });

  it('verweigert weitere Platzierungskämpfe nach der Platzierung', async () => {
    addPlayers(2);
    await call(alice, 'POST', '/api/league/join');
    t.league.ratingRows.get(aliceId)!.games = 5;
    const res = await call(alice, 'POST', '/api/league/placement');
    expect(res.json().code).toBe('already_placed');
  });
});

describe('Liga-Zyklus', () => {
  it('teilt ein, sperrt vor dem Spieltag und spielt zum Spieltag', async () => {
    const others = addPlayers(5);
    expect((await call(alice, 'POST', '/api/league/join')).json().joined).toBe(true);
    t.league.ratingRows.get(aliceId)!.games = 5;

    // 12:00 Uhr: Zyklus startet, erster Spieltag heute 20:00 (Lock 19:00)
    expect((await tick()).json()).toMatchObject({ cyclesStarted: 1, locked: 0, played: 0 });
    const view = (await call(alice, 'GET', '/api/league')).json();
    expect(view.cycle).toMatchObject({ number: 1, status: 'active' });
    expect(view.division.table).toHaveLength(6);
    expect(view.division.matches).toHaveLength(15); // 6 Spieler, 5 Spieltage à 3 Paarungen
    expect(new Date(view.next.playAt).toISOString()).toBe('2026-11-12T19:00:00.000Z');
    expect(view.next.locked).toBe(false);

    t.time.tick(7 * HOUR + 30 * 60_000); // 19:30
    expect((await tick()).json()).toMatchObject({ locked: 3, played: 0 });
    expect((await call(alice, 'GET', '/api/league')).json().next.locked).toBe(true);

    t.time.tick(HOUR); // 20:30
    expect((await tick()).json()).toMatchObject({ played: 3 });
    const fights = t.fights.fights.filter((f) => f.kind === 'league');
    expect(fights).toHaveLength(3);
    // Liga-Kämpfe belohnen, zählen aber nicht fürs Tageslimit
    expect(fights.flatMap((f) => f.participants).every((p) => !p.rewarded)).toBe(true);
    const table = (await call(alice, 'GET', '/api/league')).json().division.table;
    expect(table.reduce((s: number, r: { played: number }) => s + r.played, 0)).toBe(6);
    expect(others).toHaveLength(5);

    // Jede Division ist einsehbar, auch ohne eigene Teilnahme
    const division = (await call(alice, 'GET', '/api/league/divisions/0')).json();
    expect(division.cycle.number).toBe(1);
    expect(division.division.table.some((r: { me: boolean }) => r.me)).toBe(true);
    expect((await call(alice, 'GET', '/api/league/divisions/3')).json().code).toBe(
      'division_not_found',
    );
  });

  it('holt nach dem Vorspulen alle Spieltage in Reihenfolge nach und startet den nächsten Zyklus', async () => {
    addPlayers(9);
    await call(alice, 'POST', '/api/league/join');
    t.league.ratingRows.get(aliceId)!.games = 5;
    // 10 Spieler: eine Division, 9 Spieltage vom 12. bis 20.11.
    expect((await tick()).json().cyclesStarted).toBe(1);
    t.time.tick(9 * 24 * HOUR); // 21.11., 12:00 Uhr
    const result = (await tick()).json();
    expect(result).toMatchObject({ played: 45, cyclesFinished: 1, cyclesStarted: 1 });
    const [first, second] = t.league.cycles;
    expect(first!.status).toBe('finished');
    expect(second!.status).toBe('active');
    // Der zweite Zyklus schließt an den letzten Spieltag an, nicht an „jetzt“
    expect(second!.startsAt.getTime() - first!.endsAt.getTime()).toBe(24 * HOUR);
    const places = t.league.memberRows.filter((m) => m.cycleId === first!.id).map((m) => m.place);
    expect(places.sort((a, b) => a! - b!)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    // Eine einzige Division: kein Auf- und Abstieg
    expect(t.league.memberRows.every((m) => m.movement === null || m.movement === 'stay')).toBe(
      true,
    );
  });

  it('startet erst mit genug angemeldeten Spielern', async () => {
    addPlayers(2);
    expect((await tick()).json()).toMatchObject({ cyclesStarted: 0 });
  });
});

describe('Rangliste', () => {
  it('zeigt nur platzierte Charaktere nach Rating', async () => {
    addPlayers(3);
    const board = (await call(alice, 'GET', '/api/league/leaderboard?limit=10')).json();
    expect(board.map((r: { name: string }) => r.name)).toEqual(['Player0', 'Player1', 'Player2']);
    expect(board[0]).toMatchObject({ place: 1, rating: 1600, me: false });
    const bad = await call(alice, 'GET', '/api/league/leaderboard?limit=0');
    expect(bad.statusCode).toBe(400);
  });

  it('filtert nach der Heimat-Community', async () => {
    addPlayers(3);
    const me = t.characters.records.find((c) => c.id === aliceId)!;
    t.league.homes.set(me.accountId, 'c1');
    t.league.homes.set('acc-1', 'c1');
    t.league.homes.set('acc-2', 'c2');
    const board = (await call(alice, 'GET', '/api/league/leaderboard?scope=community')).json();
    expect(board.map((r: { name: string }) => r.name)).toEqual(['Player1']);
  });
});
