import type { DiscordFightSummary } from '@tbca/shared';

/** Bot-Texte; Sprache nach Discord-Einstellung des Nutzers (DE, sonst EN). */
const de = {
  registered: (name: string) => `Willkommen in der Arena, **${name}**! Dein Charakter ist bereit.`,
  profile: (p: {
    name: string;
    classId: string;
    level: number;
    xp: number;
    xpToNext: number | null;
    credits: number;
    url: string;
  }) =>
    `**${p.name}** – ${className(p.classId)}, Level ${p.level}` +
    (p.xpToNext ? ` (${p.xp}/${p.xpToNext} XP)` : '') +
    `, ${p.credits} Credits\n${p.url}`,
  fight: (f: DiscordFightSummary) =>
    `${f.winner ? `**${f.winner}** gewinnt` : 'Unentschieden'} nach ${f.rounds} Runden.` +
    (f.bestHit ? ` Bester Treffer: ${f.bestHit.name} mit ${f.bestHit.value}.` : '') +
    (f.xp > 0 ? ` +${f.xp} XP, +${f.credits} Credits.` : ' Keine Belohnung.') +
    (f.levelUp ? ` Level ${f.levelUp} erreicht!` : '') +
    `\nReplay: ${f.url}`,
  setupDone: (name: string) =>
    `Dieser Server gehört jetzt zur Community **${name}**. Lege mit \`/tbca-admin xp-kanal\` fest, wo Nachrichten XP geben.`,
  channelXp: (enabled: boolean): string =>
    enabled ? 'In diesem Kanal geben Nachrichten jetzt XP.' : 'Dieser Kanal gibt keine XP mehr.',
  errors: {
    guild_not_set_up:
      'Dieser Server ist noch keiner Community zugeordnet. Ein Admin kann `/tbca-admin einrichten` nutzen.',
    not_registered: 'Du hast noch keinen Charakter. Nutze `/tbca registrieren`.',
    opponent_not_found: 'Dein Gegner hat noch keinen Charakter.',
    character_exists: 'Du hast in dieser Season schon einen Charakter.',
    name_taken: 'Dieser Name ist in dieser Season schon vergeben.',
    self_challenge: 'Du kannst dich nicht selbst herausfordern.',
    no_active_season: 'Gerade läuft keine Season.',
    unavailable: 'TBCA ist gerade nicht erreichbar. Versuch es gleich noch einmal.',
    invalid_name: 'Dieser Name ist nicht erlaubt (3–20 Zeichen, keine reservierten Wörter).',
    fallback: 'Das hat nicht geklappt.',
  },
};

const en: typeof de = {
  registered: (name) => `Welcome to the arena, **${name}**! Your character is ready.`,
  profile: (p) =>
    `**${p.name}** – ${className(p.classId)}, level ${p.level}` +
    (p.xpToNext ? ` (${p.xp}/${p.xpToNext} XP)` : '') +
    `, ${p.credits} credits\n${p.url}`,
  fight: (f) =>
    `${f.winner ? `**${f.winner}** wins` : 'Draw'} after ${f.rounds} rounds.` +
    (f.bestHit ? ` Best hit: ${f.bestHit.name} with ${f.bestHit.value}.` : '') +
    (f.xp > 0 ? ` +${f.xp} XP, +${f.credits} credits.` : ' No reward.') +
    (f.levelUp ? ` Reached level ${f.levelUp}!` : '') +
    `\nReplay: ${f.url}`,
  setupDone: (name) =>
    `This server now belongs to the community **${name}**. Use \`/tbca-admin xp-kanal\` to choose where messages give XP.`,
  channelXp: (enabled) =>
    enabled ? 'Messages in this channel now give XP.' : 'This channel no longer gives XP.',
  errors: {
    guild_not_set_up:
      "This server isn't linked to a community yet. An admin can use `/tbca-admin einrichten`.",
    not_registered: "You don't have a character yet. Use `/tbca registrieren`.",
    opponent_not_found: "Your opponent doesn't have a character yet.",
    character_exists: 'You already have a character this season.',
    name_taken: 'That name is already taken this season.',
    self_challenge: "You can't challenge yourself.",
    no_active_season: 'No season is running right now.',
    unavailable: "TBCA can't be reached right now. Please try again shortly.",
    invalid_name: "That name isn't allowed (3–20 characters, no reserved words).",
    fallback: "That didn't work.",
  },
};

export type Texts = typeof de;

export function textsFor(locale: string | null | undefined): Texts {
  return locale?.startsWith('de') ? de : en;
}

export function errorText(texts: Texts, code: string): string {
  if (code.startsWith('invalid_name')) return texts.errors.invalid_name;
  return (texts.errors as Record<string, string>)[code] ?? texts.errors.fallback;
}

function className(id: string): string {
  return (
    { bruiser: 'Bruiser', gunner: 'Gunner', netrunner: 'Netrunner', medtech: 'Medtech' }[id] ?? id
  );
}
