import { z } from 'zod';

import type { Env } from '../config/env.js';
import type { DiscordOAuth, ExternalProfile } from './types.js';

const DISCORD_AUTHORIZE_URL = 'https://discord.com/oauth2/authorize';
const DISCORD_API = 'https://discord.com/api/v10';
const REQUEST_TIMEOUT_MS = 10_000;

const tokenResponse = z.object({ access_token: z.string().min(1), token_type: z.string() });
const userResponse = z.object({
  id: z.string().regex(/^\d+$/),
  username: z.string(),
  global_name: z.string().nullish(),
  avatar: z.string().nullish(),
});

export class DiscordOAuthError extends Error {
  override readonly name = 'DiscordOAuthError';
}

/**
 * Discord-OAuth2 (Authorization Code Flow) mit dem Scope `identify`.
 * Es wird nur die Plattform-ID, der Anzeigename und der Avatar gelesen – keine E-Mail,
 * keine Server, keine Nachrichten.
 */
export class DiscordOAuthClient implements DiscordOAuth {
  constructor(
    private readonly env: Env,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  authorizeUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.requireClientId(),
      redirect_uri: this.env.DISCORD_REDIRECT_URI,
      response_type: 'code',
      scope: 'identify',
      state,
      prompt: 'none',
    });
    return `${DISCORD_AUTHORIZE_URL}?${params.toString()}`;
  }

  async fetchProfile(code: string): Promise<ExternalProfile> {
    const clientId = this.requireClientId();
    const secret = this.env.DISCORD_CLIENT_SECRET;
    if (!secret) throw new DiscordOAuthError('DISCORD_CLIENT_SECRET fehlt');

    const tokenRes = await this.fetchFn(`${DISCORD_API}/oauth2/token`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.env.DISCORD_REDIRECT_URI,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!tokenRes.ok)
      throw new DiscordOAuthError(`Token-Tausch fehlgeschlagen (${tokenRes.status})`);
    const token = tokenResponse.parse(await tokenRes.json());

    const userRes = await this.fetchFn(`${DISCORD_API}/users/@me`, {
      headers: { authorization: `Bearer ${token.access_token}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!userRes.ok) throw new DiscordOAuthError(`Profil nicht lesbar (${userRes.status})`);
    const user = userResponse.parse(await userRes.json());

    return {
      provider: 'discord',
      providerUserId: user.id,
      displayName: user.global_name ?? user.username,
      avatarUrl: user.avatar
        ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`
        : null,
    };
  }

  private requireClientId(): string {
    if (!this.env.DISCORD_CLIENT_ID) throw new DiscordOAuthError('DISCORD_CLIENT_ID fehlt');
    return this.env.DISCORD_CLIENT_ID;
  }
}
