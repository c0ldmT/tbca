import { REST, Routes } from 'discord.js';

import { allCommands } from './commands.js';
import { loadBotEnv } from './env.js';

/**
 * Registriert die Slash-Commands. Mit DISCORD_DEV_GUILD_ID nur auf diesem Server (sofort
 * sichtbar), sonst global (kann bis zu einer Stunde dauern).
 */
const env = loadBotEnv();
if (!env.token || !env.clientId) throw new Error('DISCORD_BOT_TOKEN und DISCORD_CLIENT_ID fehlen');
const rest = new REST().setToken(env.token);
const route = env.devGuildId
  ? Routes.applicationGuildCommands(env.clientId, env.devGuildId)
  : Routes.applicationCommands(env.clientId);
await rest.put(route, { body: allCommands });
console.info(
  `${allCommands.length} Commands ${env.devGuildId ? `auf Server ${env.devGuildId}` : 'global'} registriert.`,
);
