import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  Events,
  GatewayIntentBits,
  type ChatInputCommandInteraction,
} from 'discord.js';

import { ApiClient } from './api-client.js';
import { loadBotEnv, type BotEnv } from './env.js';
import { handleButton, handleCommand, handleMessage, type ButtonSpec } from './handlers.js';
import { errorText, textsFor } from './texts.js';

const STYLES: Record<ButtonSpec['style'], ButtonStyle> = {
  primary: ButtonStyle.Primary,
  secondary: ButtonStyle.Secondary,
  success: ButtonStyle.Success,
  danger: ButtonStyle.Danger,
};

/** Buttons als Discord-Komponenten (eine Zeile, höchstens fünf). */
function components(buttons: ButtonSpec[] | undefined) {
  if (!buttons?.length) return [];
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      buttons.slice(0, 5).map((b) =>
        new ButtonBuilder()
          .setCustomId(b.customId)
          .setLabel(b.label)
          .setStyle(STYLES[b.style])
          .setDisabled(b.disabled ?? false),
      ),
    ),
  ];
}

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
    // Dungeon-Buttons: Besitzer aktualisiert die Nachricht, alle anderen bekommen einen Hinweis
    if (interaction.isButton()) {
      try {
        const reply = await handleButton(api, {
          customId: interaction.customId,
          userId: interaction.user.id,
          displayName: interaction.user.globalName ?? interaction.user.username,
          locale: interaction.locale,
        });
        if (reply.ephemeral) await interaction.reply({ content: reply.content, ephemeral: true });
        else
          await interaction.update({
            content: reply.content,
            components: components(reply.buttons),
          });
      } catch {
        await interaction
          .reply({
            content: errorText(textsFor(interaction.locale), 'unavailable'),
            ephemeral: true,
          })
          .catch(() => undefined);
      }
      return;
    }
    if (!interaction.isChatInputCommand() || !interaction.inGuild()) return;
    const i = interaction as ChatInputCommandInteraction<'cached' | 'raw'>;
    await i.deferReply({
      ephemeral:
        i.commandName === 'tbca-admin' || ['profil', 'team'].includes(i.options.getSubcommand()),
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
          integer: (n) => i.options.getInteger(n),
        },
      });
      await i.editReply({ content: reply.content, components: components(reply.buttons) });
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
