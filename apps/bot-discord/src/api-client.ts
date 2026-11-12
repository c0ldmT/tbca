import type {
  DiscordActivityResult,
  DiscordChallengeAnswer,
  DiscordChallengeRequestView,
  DiscordDungeonView,
  DiscordLeagueNews,
  DiscordLeagueView,
  DiscordProfileView,
  DiscordTeamFightSummary,
  DiscordTeamView,
} from '@tbca/shared';

export type DungeonAction = 'status' | 'start' | 'continue' | 'heal' | 'leave';
export type LeagueAction = 'status' | 'join' | 'leave' | 'placement';

export type ApiResult<T> = { ok: true; data: T } | { ok: false; code: string };

/** Dünner Client der internen API; der Bot entscheidet nichts selbst. */
export class ApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly serviceToken: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  setup(guildId: string, guildName: string, user?: { userId: string; displayName: string }) {
    return this.call<{ communityId: string; name: string; xpChannels: string[] }>('POST', 'setup', {
      guildId,
      guildName,
      ...user,
    });
  }

  channelXp(guildId: string, channelId: string, enabled: boolean) {
    return this.call<{ xpChannels: string[] }>('POST', 'channel-xp', {
      guildId,
      channelId,
      enabled,
    });
  }

  register(input: {
    guildId: string;
    userId: string;
    displayName: string;
    name: string;
    classId: string;
  }) {
    return this.call<{ name: string; classId: string }>('POST', 'register', input);
  }

  profile(userId: string) {
    return this.call<DiscordProfileView>('GET', `profile?userId=${encodeURIComponent(userId)}`);
  }

  challenge(input: {
    userId: string;
    displayName: string;
    opponentUserId: string;
    mode: 'rated' | 'friendly';
  }) {
    return this.call<DiscordChallengeRequestView>('POST', 'challenge', input);
  }

  challengeAnswer(input: {
    userId: string;
    displayName: string;
    requestId: string;
    accept: boolean;
  }) {
    return this.call<DiscordChallengeAnswer>('POST', 'challenge-answer', input);
  }

  dungeon(input: {
    userId: string;
    displayName: string;
    action: DungeonAction;
    injectors?: number;
    backupChip?: boolean;
  }) {
    return this.call<DiscordDungeonView>('POST', 'dungeon', input);
  }

  teams(userId: string) {
    return this.call<DiscordTeamView>('GET', `teams?userId=${encodeURIComponent(userId)}`);
  }

  teamChallenge(input: {
    userId: string;
    displayName: string;
    opponentTag: string;
    size: 2 | 3;
    mode: 'rated' | 'friendly';
  }) {
    return this.call<DiscordTeamFightSummary>('POST', 'team-challenge', input);
  }

  leagueChannel(guildId: string, channelId: string, enabled: boolean) {
    return this.call<{ name: string }>('POST', 'league-channel', { guildId, channelId, enabled });
  }

  league(input: { userId: string; displayName: string; action: LeagueAction }) {
    return this.call<DiscordLeagueView>('POST', 'league', input);
  }

  /** Neue Ankündigungen abholen; danach gelten sie als angekündigt. */
  leagueNews() {
    return this.call<DiscordLeagueNews[]>('POST', 'league-news', {});
  }

  activity(input: {
    eventId: string;
    guildId: string;
    channelId: string;
    userId: string;
    displayName: string;
    length: number;
    hash: string;
  }) {
    return this.call<DiscordActivityResult>('POST', 'activity', input);
  }

  private async call<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
  ): Promise<ApiResult<T>> {
    try {
      const res = await this.fetchFn(`${this.baseUrl}/internal/discord/${path}`, {
        method,
        headers: {
          authorization: `Bearer ${this.serviceToken}`,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(10_000),
      });
      const json = (await res.json().catch(() => ({}))) as { code?: unknown };
      if (!res.ok)
        return {
          ok: false,
          code: typeof json.code === 'string' ? json.code : `http_${res.status}`,
        };
      return { ok: true, data: json as T };
    } catch {
      return { ok: false, code: 'unavailable' };
    }
  }
}
