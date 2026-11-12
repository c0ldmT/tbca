import type {
  DiscordChallengeAnswer,
  DiscordChallengeRequestView,
  DiscordDungeonView,
  DiscordFightSummary,
  DiscordLeagueNews,
  DiscordLeagueView,
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
    (f.opponentReward && f.opponentReward.xp > 0
      ? ` ${f.opponentReward.name}: +${f.opponentReward.xp} XP, +${f.opponentReward.credits} Credits.`
      : '') +
    (f.levelUp ? ` Level ${f.levelUp} erreicht!` : '') +
    `\nReplay: ${f.url}`,
  challengeRequest: (r: DiscordChallengeRequestView): string =>
    `⚔️ **${r.challenger}** fordert **${r.opponent}** heraus (${r.mode === 'rated' ? 'gewertet' : 'Freundschaft'}). ` +
    `<@${r.opponentUserId}>, nimmst du an? Die Anfrage läuft ${stamp(r.expiresAt, 'R')} ab.`,
  challengeButtons: { accept: 'Annehmen', decline: 'Ablehnen' },
  challengeNotYours: 'Diese Herausforderung gilt nicht dir.',
  challengeAnswered: (a: DiscordChallengeAnswer): string =>
    a.status === 'declined' || !a.fight
      ? `**${a.opponent}** hat die Herausforderung von **${a.challenger}** abgelehnt.`
      : `**${a.opponent}** nimmt an! ` + de.fight(a.fight),
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
            ? `Items: ${d.items.map((i) => `${i.names.de} ★${i.rarity}`).join(', ')}`
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
  league: (v: DiscordLeagueView): string => {
    const lines = [
      v.rating === null
        ? '**Liga** – noch kein Rating.'
        : `**Liga** – Rating **${v.rating}** aus ${v.games} gewerteten Kämpfen.`,
    ];
    if (v.fight) lines.push(de.fight(v.fight));
    if (v.placementLeft > 0)
      lines.push(`Platzierung: noch ${v.placementLeft} gewertete Kämpfe bis zur Einteilung.`);
    if (v.division)
      lines.push(
        `Division ${v.division.index} von ${v.division.count}: Platz ${v.division.place} von ${v.division.size}, ${v.division.points} Punkte.`,
      );
    if (v.next)
      lines.push(
        `Spieltag ${v.next.matchday}: ${stamp(v.next.playAt)}` +
          (v.next.locked ? ' – gesperrt, es zählt der Stand vom Lock.' : ''),
      );
    else if (v.joined && v.placementLeft === 0)
      lines.push('Angemeldet – du wirst im nächsten Zyklus eingeteilt.');
    lines.push(v.url);
    return lines.join('\n');
  },
  leagueButtons: {
    placement: (left: number) => `Platzierungskampf (noch ${left})`,
    join: 'Für die Liga anmelden',
    leave: 'Abmelden',
    notYours: 'Das ist nicht deine Liga-Ansicht. Nutze `/tbca liga`.',
  },
  leagueChannel: (enabled: boolean): string =>
    enabled
      ? 'Liga-Ankündigungen kommen jetzt in diesen Kanal.'
      : 'In diesem Kanal gibt es keine Liga-Ankündigungen mehr.',
  leagueNews: (n: DiscordLeagueNews): string =>
    n.items
      .map((i) =>
        i.kind === 'matchday'
          ? `⚔️ **Liga · Zyklus ${i.cycle}, Spieltag ${i.matchday}** (${stamp(i.playAt)})\n` +
            i.results
              .map(
                (r) =>
                  `• ${r.a} – ${r.b}: ${r.winner ? `**${r.winner}** gewinnt` : 'Unentschieden'}` +
                  (r.url ? ` · <${r.url}>` : ''),
              )
              .join('\n')
          : `🏁 **Liga · Zyklus ${i.cycle} beendet**\n` +
            i.rows
              .map(
                (r) =>
                  `• ${r.name}: Division ${r.division}, Platz ${r.place}` +
                  (r.movement === 'up'
                    ? ' – Aufstieg ▲'
                    : r.movement === 'down'
                      ? ' – Abstieg ▼'
                      : ''),
              )
              .join('\n'),
      )
      .join('\n\n') + `\n${n.url}`,
  errors: {
    no_team: 'Du bist in keinem Team. Gründe eins auf der Website.',
    challenge_expired: 'Diese Herausforderung ist abgelaufen.',
    challenge_closed: 'Über diese Herausforderung ist schon entschieden.',
    challenge_not_found: 'Diese Herausforderung gibt es nicht mehr.',
    not_your_challenge: 'Diese Herausforderung gilt nicht dir.',
    already_placed: 'Deine Platzierung ist abgeschlossen.',
    no_opponent: 'Gerade ist kein passender Gegner da.',
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
    (f.opponentReward && f.opponentReward.xp > 0
      ? ` ${f.opponentReward.name}: +${f.opponentReward.xp} XP, +${f.opponentReward.credits} credits.`
      : '') +
    (f.levelUp ? ` Reached level ${f.levelUp}!` : '') +
    `\nReplay: ${f.url}`,
  challengeRequest: (r) =>
    `⚔️ **${r.challenger}** challenges **${r.opponent}** (${r.mode === 'rated' ? 'rated' : 'friendly'}). ` +
    `<@${r.opponentUserId}>, do you accept? The request expires ${stamp(r.expiresAt, 'R')}.`,
  challengeButtons: { accept: 'Accept', decline: 'Decline' },
  challengeNotYours: "This challenge isn't for you.",
  challengeAnswered: (a) =>
    a.status === 'declined' || !a.fight
      ? `**${a.opponent}** declined the challenge from **${a.challenger}**.`
      : `**${a.opponent}** accepts! ` + en.fight(a.fight),
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
            ? `Items: ${d.items.map((i) => `${i.names.en} ★${i.rarity}`).join(', ')}`
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
  league: (v) => {
    const lines = [
      v.rating === null
        ? '**League** – no rating yet.'
        : `**League** – rating **${v.rating}** from ${v.games} rated fights.`,
    ];
    if (v.fight) lines.push(en.fight(v.fight));
    if (v.placementLeft > 0)
      lines.push(`Placement: ${v.placementLeft} more rated fights until you get a division.`);
    if (v.division)
      lines.push(
        `Division ${v.division.index} of ${v.division.count}: place ${v.division.place} of ${v.division.size}, ${v.division.points} points.`,
      );
    if (v.next)
      lines.push(
        `Matchday ${v.next.matchday}: ${stamp(v.next.playAt)}` +
          (v.next.locked ? ' – locked, your state at the lock counts.' : ''),
      );
    else if (v.joined && v.placementLeft === 0)
      lines.push("Signed up – you'll get a division in the next cycle.");
    lines.push(v.url);
    return lines.join('\n');
  },
  leagueButtons: {
    placement: (left) => `Placement fight (${left} left)`,
    join: 'Join the league',
    leave: 'Leave',
    notYours: "That's not your league view. Use `/tbca liga`.",
  },
  leagueChannel: (enabled) =>
    enabled
      ? 'League announcements now go to this channel.'
      : 'This channel no longer gets league announcements.',
  leagueNews: (n) =>
    n.items
      .map((i) =>
        i.kind === 'matchday'
          ? `⚔️ **League · cycle ${i.cycle}, matchday ${i.matchday}** (${stamp(i.playAt)})\n` +
            i.results
              .map(
                (r) =>
                  `• ${r.a} – ${r.b}: ${r.winner ? `**${r.winner}** wins` : 'draw'}` +
                  (r.url ? ` · <${r.url}>` : ''),
              )
              .join('\n')
          : `🏁 **League · cycle ${i.cycle} finished**\n` +
            i.rows
              .map(
                (r) =>
                  `• ${r.name}: division ${r.division}, place ${r.place}` +
                  (r.movement === 'up'
                    ? ' – promoted ▲'
                    : r.movement === 'down'
                      ? ' – relegated ▼'
                      : ''),
              )
              .join('\n'),
      )
      .join('\n\n') + `\n${n.url}`,
  errors: {
    no_team: "You're not in a team. Found one on the website.",
    challenge_expired: 'This challenge has expired.',
    challenge_closed: 'This challenge has already been decided.',
    challenge_not_found: "This challenge doesn't exist anymore.",
    not_your_challenge: "This challenge isn't for you.",
    already_placed: 'Your placement is complete.',
    no_opponent: 'No suitable opponent right now.',
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

/** Discord-Zeitstempel: zeigt jedem die eigene Ortszeit. */
function stamp(iso: string, style: 'f' | 'R' = 'f'): string {
  return `<t:${Math.floor(Date.parse(iso) / 1000)}:${style}>`;
}

function className(id: string): string {
  return (
    { bruiser: 'Bruiser', gunner: 'Gunner', netrunner: 'Netrunner', medtech: 'Medtech' }[id] ?? id
  );
}
