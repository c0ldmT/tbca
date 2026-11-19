import type { DiscordActivityResult, DiscordFightSummary, DiscordProfileView } from '@tbca/shared';

export type ApiResult<T> = { ok: true; data: T } | { ok: false; code: string };

/** Dünner Client der internen API; der Bot entscheidet nichts selbst. */
export class ApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly serviceToken: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  setup(guildId: string, guildName: string) {
    return this.call<{ communityId: string; name: string; xpChannels: string[] }>('POST', 'setup', {
      guildId,
      guildName,
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
    return this.call<DiscordFightSummary>('POST', 'challenge', input);
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
