import type { DiscordDungeonView, DiscordLeagueView } from '@tbca/shared';

import type { ApiClient, DungeonAction, LeagueAction } from './api-client.js';
import { fingerprint } from './activity.js';
import { errorText, textsFor, type Texts } from './texts.js';

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
    integer(name: string): number | null;
  };
}

/** Button unter einer Bot-Nachricht; die ID trägt Aktion und Besitzer. */
export interface ButtonSpec {
  customId: string;
  label: string;
  style: 'primary' | 'secondary' | 'success' | 'danger';
  disabled?: boolean;
}

export interface CommandReply {
  content: string;
  /** Nur für den Aufrufer sichtbar (Fehler, Admin-Antworten). */
  ephemeral: boolean;
  buttons?: ButtonSpec[];
}

export interface ButtonInput {
  customId: string;
  userId: string;
  displayName: string;
  locale: string;
}

/**
 * Button-ID für den Dungeon: `dg:<aktion>:<besitzer>[:<injektoren>:<chip>]`. Nur der Besitzer
 * darf drücken; Start-Optionen reisen in der ID mit, weil Buttons keine Eingaben haben.
 */
export function dungeonButtonId(
  action: DungeonAction,
  ownerId: string,
  start?: { injectors: number; backupChip: boolean },
): string {
  const base = `dg:${action}:${ownerId}`;
  return start ? `${base}:${start.injectors}:${start.backupChip ? 1 : 0}` : base;
}

/** Nachricht mit passenden Buttons zu einem Dungeon-Stand. */
export function dungeonReply(
  t: Texts,
  d: DiscordDungeonView,
  ownerId: string,
  start: { injectors: number; backupChip: boolean } = { injectors: 0, backupChip: false },
): CommandReply {
  const buttons: ButtonSpec[] = [];
  if (d.status === 'active') {
    buttons.push(
      {
        customId: dungeonButtonId('continue', ownerId),
        label: t.dungeonButtons.continue(d.next?.floor ?? d.floor + 1),
        style: d.next?.boss ? 'danger' : 'primary',
      },
      {
        customId: dungeonButtonId('leave', ownerId),
        label: t.dungeonButtons.leave,
        style: 'success',
      },
      {
        customId: dungeonButtonId('heal', ownerId),
        label: t.dungeonButtons.heal,
        style: 'secondary',
        disabled: !d.canHeal,
      },
    );
  } else if (d.runsLeft > 0) {
    buttons.push({
      customId: dungeonButtonId('start', ownerId, start),
      label: t.dungeonButtons.start(d.fee),
      style: 'primary',
    });
  }
  return { content: t.dungeon(d), ephemeral: false, buttons };
}

/** Liga-Stand mit Buttons: Platzierungskampf, Anmelden oder Abmelden. */
export function leagueReply(t: Texts, v: DiscordLeagueView, ownerId: string): CommandReply {
  const buttons: ButtonSpec[] = [];
  if (v.placementLeft > 0)
    buttons.push({
      customId: `lg:placement:${ownerId}`,
      label: t.leagueButtons.placement(v.placementLeft),
      style: 'primary',
    });
  buttons.push(
    v.joined
      ? { customId: `lg:leave:${ownerId}`, label: t.leagueButtons.leave, style: 'secondary' }
      : { customId: `lg:join:${ownerId}`, label: t.leagueButtons.join, style: 'success' },
  );
  return { content: t.league(v), ephemeral: true, buttons };
}

/** Klick auf einen Dungeon- oder Liga-Button: Entscheidung an die API, Nachricht aktualisieren. */
export async function handleButton(api: ApiClient, input: ButtonInput): Promise<CommandReply> {
  const t = textsFor(input.locale);
  const [prefix, action, ownerId, inj, chip] = input.customId.split(':');
  if (prefix === 'lg') {
    const actions: LeagueAction[] = ['join', 'leave', 'placement'];
    if (!actions.includes(action as LeagueAction) || !ownerId)
      return { content: errorText(t, 'fallback'), ephemeral: true };
    if (ownerId !== input.userId) return { content: t.leagueButtons.notYours, ephemeral: true };
    const res = await api.league({
      userId: input.userId,
      displayName: input.displayName,
      action: action as LeagueAction,
    });
    if (!res.ok) return { content: errorText(t, res.code), ephemeral: true };
    return leagueReply(t, res.data, input.userId);
  }
  const actions: DungeonAction[] = ['start', 'continue', 'heal', 'leave'];
  if (prefix !== 'dg' || !actions.includes(action as DungeonAction) || !ownerId)
    return { content: errorText(t, 'fallback'), ephemeral: true };
  if (ownerId !== input.userId) return { content: t.dungeonButtons.notYours, ephemeral: true };
  const start = { injectors: Number(inj ?? 0) || 0, backupChip: chip === '1' };
  const res = await api.dungeon({
    userId: input.userId,
    displayName: input.displayName,
    action: action as DungeonAction,
    ...(action === 'start' ? start : {}),
  });
  if (!res.ok) return { content: errorText(t, res.code), ephemeral: true };
  return dungeonReply(t, res.data, input.userId, start);
}

export async function handleCommand(api: ApiClient, input: CommandInput): Promise<CommandReply> {
  const t = textsFor(input.locale);
  const fail = (code: string): CommandReply => ({ content: errorText(t, code), ephemeral: true });

  if (input.command === 'tbca-admin') {
    if (input.subcommand === 'einrichten') {
      const res = await api.setup(input.guildId, input.guildName, {
        userId: input.userId,
        displayName: input.displayName,
      });
      return res.ok ? { content: t.setupDone(res.data.name), ephemeral: true } : fail(res.code);
    }
    if (input.subcommand === 'liga-kanal') {
      const channel = input.options.channel('kanal');
      const enabled = input.options.boolean('aktiv') ?? false;
      if (!channel) return fail('fallback');
      const res = await api.leagueChannel(input.guildId, channel.id, enabled);
      return res.ok ? { content: t.leagueChannel(enabled), ephemeral: true } : fail(res.code);
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
      case 'dungeon': {
        const start = {
          injectors: input.options.integer('injektoren') ?? 0,
          backupChip: input.options.boolean('backup-chip') ?? false,
        };
        const res = await api.dungeon({
          userId: input.userId,
          displayName: input.displayName,
          action: 'status',
        });
        return res.ok ? dungeonReply(t, res.data, input.userId, start) : fail(res.code);
      }
      case 'liga': {
        const res = await api.league({
          userId: input.userId,
          displayName: input.displayName,
          action: 'status',
        });
        return res.ok ? leagueReply(t, res.data, input.userId) : fail(res.code);
      }
      case 'team': {
        const res = await api.teams(input.userId);
        return res.ok ? { content: t.teams(res.data), ephemeral: true } : fail(res.code);
      }
      case 'team-kampf': {
        const size = input.options.integer('groesse') === 3 ? 3 : 2;
        const res = await api.teamChallenge({
          userId: input.userId,
          displayName: input.displayName,
          opponentTag: input.options.string('gegner') ?? '',
          size,
          mode: input.options.string('modus') === 'friendly' ? 'friendly' : 'rated',
        });
        return res.ok ? { content: t.teamFight(res.data), ephemeral: false } : fail(res.code);
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

/**
 * Liga-Ankündigungen abholen und in die Kanäle schicken. Die Sprache folgt der bevorzugten
 * Sprache des Servers. Liefert die Zahl der gesendeten Nachrichten.
 */
export async function deliverLeagueNews(
  api: ApiClient,
  send: (target: { guildId: string; channelId: string }, content: string) => Promise<void>,
  localeOf: (guildId: string) => string,
): Promise<number> {
  const res = await api.leagueNews();
  if (!res.ok) return 0;
  let sent = 0;
  for (const news of res.data) {
    try {
      await send(news, textsFor(localeOf(news.guildId)).leagueNews(news).slice(0, 2000));
      sent++;
    } catch {
      // Kanal gelöscht oder keine Rechte: die nächste Ankündigung versucht es wieder
    }
  }
  return sent;
}
