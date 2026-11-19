import type { ApiClient } from './api-client.js';
import { fingerprint } from './activity.js';
import { errorText, textsFor } from './texts.js';

/**
 * Was die Handler von einer Discord-Interaktion brauchen. Absichtlich schmal, damit sie sich ohne
 * Discord testen lassen; main.ts übersetzt die echte Interaktion.
 */
export interface CommandInput {
  command: string;
  subcommand: string;
  guildId: string;
  guildName: string;
  channelId: string;
  userId: string;
  displayName: string;
  locale: string;
  options: {
    string(name: string): string | null;
    user(name: string): { id: string; bot: boolean } | null;
    channel(name: string): { id: string } | null;
    boolean(name: string): boolean | null;
  };
}

export interface CommandReply {
  content: string;
  /** Nur für den Aufrufer sichtbar (Fehler, Admin-Antworten). */
  ephemeral: boolean;
}

export async function handleCommand(api: ApiClient, input: CommandInput): Promise<CommandReply> {
  const t = textsFor(input.locale);
  const fail = (code: string): CommandReply => ({ content: errorText(t, code), ephemeral: true });

  if (input.command === 'tbca-admin') {
    if (input.subcommand === 'einrichten') {
      const res = await api.setup(input.guildId, input.guildName);
      return res.ok ? { content: t.setupDone(res.data.name), ephemeral: true } : fail(res.code);
    }
    if (input.subcommand === 'xp-kanal') {
      const channel = input.options.channel('kanal');
      const enabled = input.options.boolean('aktiv') ?? false;
      if (!channel) return fail('fallback');
      const res = await api.channelXp(input.guildId, channel.id, enabled);
      return res.ok ? { content: t.channelXp(enabled), ephemeral: true } : fail(res.code);
    }
  }

  if (input.command === 'tbca') {
    switch (input.subcommand) {
      case 'registrieren': {
        const res = await api.register({
          guildId: input.guildId,
          userId: input.userId,
          displayName: input.displayName,
          name: input.options.string('name') ?? '',
          classId: input.options.string('klasse') ?? 'bruiser',
        });
        return res.ok ? { content: t.registered(res.data.name), ephemeral: false } : fail(res.code);
      }
      case 'profil': {
        const res = await api.profile(input.userId);
        return res.ok ? { content: t.profile(res.data), ephemeral: true } : fail(res.code);
      }
      case 'kampf': {
        const opponent = input.options.user('gegner');
        if (!opponent || opponent.bot) return fail('opponent_not_found');
        const mode = input.options.string('modus') === 'friendly' ? 'friendly' : 'rated';
        const res = await api.challenge({
          userId: input.userId,
          displayName: input.displayName,
          opponentUserId: opponent.id,
          mode,
        });
        return res.ok ? { content: t.fight(res.data), ephemeral: false } : fail(res.code);
      }
    }
  }
  return fail('fallback');
}

export interface MessageInput {
  id: string;
  guildId: string | null;
  channelId: string;
  authorId: string;
  authorBot: boolean;
  displayName: string;
  content: string;
}

/** Meldet eine Nachricht als Aktivität – ohne Inhalt, nur Länge und Hash. */
export async function handleMessage(api: ApiClient, message: MessageInput): Promise<void> {
  if (message.authorBot || !message.guildId) return;
  const { length, hash } = fingerprint(message.content);
  await api.activity({
    eventId: message.id,
    guildId: message.guildId,
    channelId: message.channelId,
    userId: message.authorId,
    displayName: message.displayName,
    length,
    hash,
  });
}
