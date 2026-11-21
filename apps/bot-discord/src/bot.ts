import { Client, Events, GatewayIntentBits, type ChatInputCommandInteraction } from 'discord.js';

import { ApiClient } from './api-client.js';
import { loadBotEnv, type BotEnv } from './env.js';
import { handleCommand, handleMessage } from './handlers.js';
import { errorText, textsFor } from './texts.js';

/**
 * Startet den Discord-Bot. Liefert null, wenn Token fehlen – dann läuft der Rest (z. B. im
 * kombinierten Prozess des Sparprofils) ohne Bot weiter.
 */
export async function startBot(env: BotEnv = loadBotEnv()): Promise<Client | null> {
  if (!env.token || !env.serviceToken) {
    console.warn(
      'Discord-Bot nicht gestartet: DISCORD_BOT_TOKEN und BOT_SERVICE_TOKEN in .env setzen.',
    );
    return null;
  }

  const api = new ApiClient(env.apiUrl, env.serviceToken);
  const client = new Client({
    // MessageContent ist nötig, um Länge und Wiederholung zu prüfen; Inhalte werden nicht gespeichert.
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  client.once(Events.ClientReady, (c) => console.info(`Discord-Bot angemeldet als ${c.user.tag}`));

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand() || !interaction.inGuild()) return;
    const i = interaction as ChatInputCommandInteraction<'cached' | 'raw'>;
    await i.deferReply({
      ephemeral: i.commandName === 'tbca-admin' || i.options.getSubcommand() === 'profil',
    });
    try {
      const reply = await handleCommand(api, {
        command: i.commandName,
        subcommand: i.options.getSubcommand(),
        guildId: i.guildId,
        guildName: i.guild?.name ?? i.guildId,
        channelId: i.channelId,
        userId: i.user.id,
        displayName: i.user.globalName ?? i.user.username,
        locale: i.locale,
        options: {
          string: (n) => i.options.getString(n),
          user: (n) => {
            const u = i.options.getUser(n);
            return u ? { id: u.id, bot: u.bot } : null;
          },
          channel: (n) => {
            const c = i.options.getChannel(n);
            return c ? { id: c.id } : null;
          },
          boolean: (n) => i.options.getBoolean(n),
        },
      });
      await i.editReply(reply.content);
    } catch {
      await i.editReply(errorText(textsFor(i.locale), 'unavailable')).catch(() => undefined);
    }
  });

  client.on(Events.MessageCreate, (message) => {
    void handleMessage(api, {
      id: message.id,
      guildId: message.guildId,
      channelId: message.channelId,
      authorId: message.author.id,
      authorBot: message.author.bot,
      displayName: message.member?.displayName ?? message.author.username,
      content: message.content,
    }).catch(() => undefined); // Aktivität ist nebensächlich; Fehler nicht weiterreichen
  });

  await client.login(env.token);
  return client;
}
