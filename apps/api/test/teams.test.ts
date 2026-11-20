import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createTestApp, login, WEB_ORIGIN, type TestApp } from './helpers.js';

type Auth = { cookie: string; csrfToken: string };
let t: TestApp;
let players: Auth[];
const DEV = '01933b5e-0000-7000-8000-00000000c001';

function call(as: Auth, method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown) {
  return t.app.inject({
    method,
    url,
    cookies: { tbca_session: as.cookie },
    headers: { 'x-csrf-token': as.csrfToken, origin: WEB_ORIGIN },
    ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
  });
}

const accountOf = (i: number) => [...t.accounts.accounts.keys()][i]!;

beforeEach(async () => {
  t = await createTestApp();
  players = [];
  const classes = ['bruiser', 'gunner', 'medtech', 'netrunner', 'gunner', 'bruiser'];
  for (let i = 0; i < 6; i++) {
    const p = await login(t, `10${i}`);
    players.push(p);
    await call(p, 'POST', '/api/characters', { name: `Spieler${i}`, classId: classes[i] });
    await call(p, 'POST', `/api/communities/${DEV}/join`);
  }
});

afterEach(async () => {
  await t.app.close();
});

async function makeTeam(captain: number, members: number[], name: string, tag: string) {
  const created = (
    await call(players[captain]!, 'POST', '/api/teams', {
      communityId: DEV,
      name,
      tag,
      logo: 'wolf',
    })
  ).json();
  const team = created[0];
  for (const m of members)
    await call(players[m]!, 'POST', '/api/teams/join', { code: team.joinCode });
  return team.id as string;
}

describe('Teams', () => {
  it('gründet Teams in der eigenen Community und lässt per Code beitreten', async () => {
    const id = await makeTeam(0, [1, 2], 'Chrome Wolves', 'cw');
    const mine = (await call(players[0]!, 'GET', '/api/teams/mine')).json();
    expect(mine[0]).toMatchObject({ id, tag: 'CW', captain: true });
    expect(mine[0].members).toHaveLength(3);
    expect(mine[0].members[1].character).toMatchObject({ name: 'Spieler1' });
  });

  it('prüft Community, Namen und eine Mitgliedschaft je Community', async () => {
    const stranger = await login(t, '999');
    const res = await call(stranger, 'POST', '/api/teams', {
      communityId: DEV,
      name: 'Lone',
      tag: 'LN',
      logo: 'eye',
    });
    expect(res.json().code).toBe('not_in_community');
    await makeTeam(0, [], 'Chrome Wolves', 'CW');
    expect(
      (
        await call(players[1]!, 'POST', '/api/teams', {
          communityId: DEV,
          name: 'chrome wolves',
          tag: 'XX',
          logo: 'eye',
        })
      ).json().code,
    ).toBe('team_name_taken');
    await makeTeam(1, [], 'Neon Saints', 'NS');
    const code = (await call(players[0]!, 'GET', '/api/teams/mine')).json()[0].joinCode;
    expect((await call(players[1]!, 'POST', '/api/teams/join', { code })).json().code).toBe(
      'already_in_team',
    );
  });

  it('übergibt die Kapitänsrolle beim Austritt und löst leere Teams auf', async () => {
    const id = await makeTeam(0, [1], 'Chrome Wolves', 'CW');
    await call(players[0]!, 'POST', `/api/teams/${id}/leave`);
    expect((await call(players[1]!, 'GET', '/api/teams/mine')).json()[0].captain).toBe(true);
    await call(players[1]!, 'POST', `/api/teams/${id}/leave`);
    expect(t.teams.teams).toHaveLength(0);
  });

  it('erlaubt nur dem Kapitän Einstellungen und prüft Aufstellungen', async () => {
    const id = await makeTeam(0, [1, 2], 'Chrome Wolves', 'CW');
    const [a, b] = [accountOf(0), accountOf(1)];
    expect(
      (
        await call(players[1]!, 'PUT', `/api/teams/${id}/settings`, {
          focus: 'healer',
          lineup2: [],
          lineup3: [],
        })
      ).json().code,
    ).toBe('not_captain');
    expect(
      (
        await call(players[0]!, 'PUT', `/api/teams/${id}/settings`, {
          focus: 'healer',
          lineup2: [a, a],
          lineup3: [],
        })
      ).json().code,
    ).toBe('invalid_lineup');
    const ok = (
      await call(players[0]!, 'PUT', `/api/teams/${id}/settings`, {
        focus: 'healer',
        lineup2: [a, b],
        lineup3: [],
      })
    ).json();
    expect(ok[0]).toMatchObject({ focus: 'healer', lineup2: [a, b] });
  });

  it('kämpft 3v3 mit Fokus und belohnt jedes Mitglied der Aufstellung', async () => {
    const wolves = await makeTeam(0, [1, 2], 'Chrome Wolves', 'CW');
    await makeTeam(3, [4, 5], 'Neon Saints', 'NS');
    const saints = t.teams.teams.find((x) => x.tag === 'NS')!.id;
    await call(players[0]!, 'PUT', `/api/teams/${wolves}/settings`, {
      focus: 'healer',
      lineup2: [],
      lineup3: [],
    });

    const lineup = [accountOf(0), accountOf(1), accountOf(2)];
    const res = await call(players[1]!, 'POST', `/api/teams/${wolves}/challenge`, {
      opponentTeamId: saints,
      size: 3,
      lineup,
      mode: 'rated',
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.rewards).toHaveLength(3);
    expect(body.rewards.every((r: { xp: number }) => r.xp > 0)).toBe(true);

    const fight = t.fights.fights.find((f) => f.id === body.fightId)!;
    expect(fight.kind).toBe('team_rated');
    expect(fight.input.teams[0]!.every((c) => c.focus === 'healer')).toBe(true);
    expect(fight.input.teams[1]).toHaveLength(3);

    // Abnahme gegen dasselbe Team: 100 %, 50 %, dann nichts.
    await call(players[1]!, 'POST', `/api/teams/${wolves}/challenge`, {
      opponentTeamId: saints,
      size: 3,
      lineup,
      mode: 'rated',
    });
    const third = (
      await call(players[1]!, 'POST', `/api/teams/${wolves}/challenge`, {
        opponentTeamId: saints,
        size: 3,
        lineup,
        mode: 'rated',
      })
    ).json();
    expect(third.rewards.every((r: { limit: string }) => r.limit === 'same_opponent')).toBe(true);
  });

  it('prüft Aufstellung und Gegner', async () => {
    const wolves = await makeTeam(0, [1], 'Chrome Wolves', 'CW');
    await makeTeam(3, [], 'Neon Saints', 'NS');
    const saints = t.teams.teams.find((x) => x.tag === 'NS')!.id;
    const bad = await call(players[0]!, 'POST', `/api/teams/${wolves}/challenge`, {
      opponentTeamId: saints,
      size: 2,
      lineup: [accountOf(0), accountOf(3)],
      mode: 'rated',
    });
    expect(bad.json().code).toBe('invalid_lineup');
    const small = await call(players[0]!, 'POST', `/api/teams/${wolves}/challenge`, {
      opponentTeamId: saints,
      size: 2,
      lineup: [accountOf(0), accountOf(1)],
      mode: 'rated',
    });
    expect(small.json().code).toBe('opponent_lineup_incomplete');
    expect((await call(players[0]!, 'GET', '/api/teams?q=neon')).json()[0]).toMatchObject({
      tag: 'NS',
      members: 1,
    });
  });
});
