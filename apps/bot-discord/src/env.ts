/** Umgebung des Bots; die Scripts laden sie aus .env.<umgebung>. */
export interface BotEnv {
  token: string | null;
  clientId: string | null;
  /** Commands nur auf diesem Server registrieren (sofort sichtbar, ideal für Entwicklung). */
  devGuildId: string | null;
  apiUrl: string;
  serviceToken: string | null;
}

export function loadBotEnv(env: NodeJS.ProcessEnv = process.env): BotEnv {
  const value = (key: string) => (env[key] && env[key] !== '' ? env[key]! : null);
  return {
    token: value('DISCORD_BOT_TOKEN'),
    clientId: value('DISCORD_CLIENT_ID'),
    devGuildId: value('DISCORD_DEV_GUILD_ID'),
    apiUrl: (value('API_INTERNAL_URL') ?? 'http://127.0.0.1:3000/api').replace(/\/+$/, ''),
    serviceToken: value('BOT_SERVICE_TOKEN'),
  };
}
