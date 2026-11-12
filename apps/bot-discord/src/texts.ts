import type {
  DiscordDungeonView,
  DiscordFightSummary,
  DiscordTeamFightSummary,
  DiscordTeamView,
} from '@tbca/shared';

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
  dungeon: (d: DiscordDungeonView): string => {
    const lines: string[] = [];
    if (d.lastFloor)
      lines.push(
        d.lastFloor.won
          ? `⚔️ Etage ${d.lastFloor.floor} geschafft!`
          : `💀 Auf Etage ${d.lastFloor.floor} besiegt.`,
      );
    switch (d.status) {
      case 'none':
        lines.push(`Kein aktiver Run. Heute noch ${d.runsLeft} Runs, Eintritt ${d.fee} Credits.`);
        break;
      case 'active':
        lines.push(
          `**Dungeon · Etage ${d.floor}** – HP ${d.hp}/${d.maxHp}, Heil-Injektoren ${d.injectors}`,
          `Loot: ${d.finds} versiegelte Funde (Inhalt beim Ausstieg), ${d.xpGained} XP`,
        );
        if (d.next)
          lines.push(
            `Nächste: ${d.next.boss ? `**Boss-Etage ${d.next.floor}**` : `Etage ${d.next.floor}`}, Monster-Level ${d.next.monsterLevel}`,
          );
        lines.push(
          'Ohne Entscheidung verlässt du den Dungeon nach 10 Minuten automatisch mit Loot.',
        );
        break;
      case 'defeated':
        lines.push(
          `Run beendet nach Etage ${d.floor}. Der Loot ist verloren, die ${d.xpGained} XP bleiben.`,
        );
        break;
      default:
        lines.push(
          `${d.status === 'saved' ? 'Der Backup-Chip hat deinen Loot gerettet!' : 'Mit dem Loot raus!'} ` +
            `Etage ${d.floor}, +${d.credits} Credits, ${d.xpGained} XP.`,
          d.items.length
            ? `Items: ${d.items.map((i) => `${itemName(i.templateId)} ★${i.rarity}`).join(', ')}`
            : '',
        );
    }
    lines.push(d.url);
    return lines.filter(Boolean).join('\n');
  },
  dungeonButtons: {
    start: (fee: number) => `Run starten (${fee} CR)`,
    continue: (floor: number) => `Weiter zu Etage ${floor}`,
    leave: 'Mit Loot raus',
    heal: 'Heil-Injektor',
    notYours: 'Das ist nicht dein Run. Starte deinen eigenen mit `/tbca dungeon`.',
  },
  teams: (v: DiscordTeamView): string =>
    v.teams.length === 0
      ? `Du bist in keinem Team. Gründe eins oder tritt per Code bei: ${v.url}`
      : v.teams
          .map(
            (t) =>
              `**[${t.tag}] ${t.name}** · ${t.community}${t.captain ? ' · Kapitän' : ''} · Code \`${t.joinCode}\`\n` +
              t.members.map((m) => `• ${m.name}${m.level ? ` (Lv ${m.level})` : ''}`).join('\n'),
          )
          .join('\n\n') + `\n${v.url}`,
  teamFight: (f: DiscordTeamFightSummary): string =>
    `**[${f.ownTag}]** gegen **[${f.opponentTag}]** (${f.size}v${f.size}): ` +
    (f.draw ? 'Unentschieden.' : f.won ? 'Sieg!' : 'Niederlage.') +
    (f.rewards.some((r) => r.xp > 0)
      ? '\n' + f.rewards.map((r) => `${r.name}: +${r.xp} XP, +${r.credits} Credits`).join('\n')
      : ' Keine Belohnung.') +
    `\nReplay: ${f.replayUrl}`,
  errors: {
    no_team: 'Du bist in keinem Team. Gründe eins auf der Website.',
    team_not_found: 'Kein Team mit diesem Kürzel gefunden.',
    invalid_lineup:
      'Die Aufstellung passt nicht – dein Team braucht genug Mitglieder mit Charakter.',
    lineup_without_character: 'Jemand in der Aufstellung hat keinen Charakter.',
    no_runs_left: 'Für heute sind alle Dungeon-Runs verbraucht.',
    run_active: 'Du hast schon einen aktiven Run.',
    no_active_run: 'Du hast keinen aktiven Run.',
    insufficient_credits: 'Dafür fehlen dir Credits.',
    insufficient_materials: 'Dafür fehlen dir Verbrauchsgüter.',
    no_injectors: 'Du hast keine Heil-Injektoren mehr.',
    too_many_injectors: 'So viele Heil-Injektoren darfst du nicht mitnehmen.',
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
  dungeon: (d) => {
    const lines: string[] = [];
    if (d.lastFloor)
      lines.push(
        d.lastFloor.won
          ? `⚔️ Floor ${d.lastFloor.floor} cleared!`
          : `💀 Defeated on floor ${d.lastFloor.floor}.`,
      );
    switch (d.status) {
      case 'none':
        lines.push(`No active run. ${d.runsLeft} runs left today, entry ${d.fee} credits.`);
        break;
      case 'active':
        lines.push(
          `**Dungeon · floor ${d.floor}** – HP ${d.hp}/${d.maxHp}, heal injectors ${d.injectors}`,
          `Loot: ${d.finds} sealed finds (revealed when you leave), ${d.xpGained} XP`,
        );
        if (d.next)
          lines.push(
            `Next: ${d.next.boss ? `**boss floor ${d.next.floor}**` : `floor ${d.next.floor}`}, monster level ${d.next.monsterLevel}`,
          );
        lines.push('Without a decision you leave automatically with your loot after 10 minutes.');
        break;
      case 'defeated':
        lines.push(
          `Run over after floor ${d.floor}. The loot is lost, your ${d.xpGained} XP stay.`,
        );
        break;
      default:
        lines.push(
          `${d.status === 'saved' ? 'Your backup chip saved the loot!' : 'Out with the loot!'} ` +
            `Floor ${d.floor}, +${d.credits} credits, ${d.xpGained} XP.`,
          d.items.length
            ? `Items: ${d.items.map((i) => `${itemName(i.templateId)} ★${i.rarity}`).join(', ')}`
            : '',
        );
    }
    lines.push(d.url);
    return lines.filter(Boolean).join('\n');
  },
  dungeonButtons: {
    start: (fee) => `Start run (${fee} CR)`,
    continue: (floor) => `On to floor ${floor}`,
    leave: 'Leave with loot',
    heal: 'Heal injector',
    notYours: "That's not your run. Start your own with `/tbca dungeon`.",
  },
  teams: (v) =>
    v.teams.length === 0
      ? `You're not in a team. Found one or join with a code: ${v.url}`
      : v.teams
          .map(
            (t) =>
              `**[${t.tag}] ${t.name}** · ${t.community}${t.captain ? ' · captain' : ''} · code \`${t.joinCode}\`\n` +
              t.members.map((m) => `• ${m.name}${m.level ? ` (lv ${m.level})` : ''}`).join('\n'),
          )
          .join('\n\n') + `\n${v.url}`,
  teamFight: (f) =>
    `**[${f.ownTag}]** vs **[${f.opponentTag}]** (${f.size}v${f.size}): ` +
    (f.draw ? 'Draw.' : f.won ? 'Victory!' : 'Defeat.') +
    (f.rewards.some((r) => r.xp > 0)
      ? '\n' + f.rewards.map((r) => `${r.name}: +${r.xp} XP, +${r.credits} credits`).join('\n')
      : ' No reward.') +
    `\nReplay: ${f.replayUrl}`,
  errors: {
    no_team: "You're not in a team. Found one on the website.",
    team_not_found: 'No team with that tag found.',
    invalid_lineup: "The lineup doesn't fit – your team needs enough members with a character.",
    lineup_without_character: 'Someone in the lineup has no character.',
    no_runs_left: 'All dungeon runs for today are used up.',
    run_active: 'You already have an active run.',
    no_active_run: "You don't have an active run.",
    insufficient_credits: "You don't have enough credits for that.",
    insufficient_materials: "You don't have the consumables for that.",
    no_injectors: 'You have no heal injectors left.',
    too_many_injectors: "You can't take that many heal injectors.",
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

/** Item-Vorlagen tragen sprechende IDs; für Discord reicht eine lesbare Form. */
function itemName(templateId: string): string {
  const base = templateId.replace(/[_-]+/g, ' ');
  return base.charAt(0).toUpperCase() + base.slice(1);
}

function className(id: string): string {
  return (
    { bruiser: 'Bruiser', gunner: 'Gunner', netrunner: 'Netrunner', medtech: 'Medtech' }[id] ?? id
  );
}
