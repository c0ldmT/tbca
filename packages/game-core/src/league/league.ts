/**
 * Liga (Spezifikation, Abschnitt 9): Divisionen mit Round Robin, ein Spieltag pro Tag, Auf- und
 * Abstieg am Zyklusende. Hier liegt nur die reine Logik – Einteilung, Spielplan, Tabelle –,
 * Zeitpunkte und Rating rechnet die API.
 */

/** Regeln der Liga; Teil der Season-Konfiguration. */
export interface LeagueRules {
  /** Angestrebte Größe einer Division. */
  readonly divisionSize: number;
  /** Kleinste Division, die entstehen darf (nur zur Prüfung der Auf- und Abstiegsplätze). */
  readonly minDivisionSize: number;
  /** Größer wird keine Division; sonst entsteht eine weitere. */
  readonly maxDivisionSize: number;
  /** Aufsteiger je Division (nicht in der obersten). */
  readonly promote: number;
  /** Absteiger je Division (nicht in der untersten). */
  readonly relegate: number;
  /** Spieltag: Uhrzeit in der Spielzeitzone. */
  readonly matchdayHour: number;
  readonly matchdayMinute: number;
  /** So viele Minuten vor dem Spieltag werden Ausrüstung, Klasse und Taktik eingefroren. */
  readonly lockMinutes: number;
  /** Gewertete Kämpfe, bevor ein Charakter eingeteilt wird (Platzierung). */
  readonly placementGames: number;
  readonly points: { readonly win: number; readonly draw: number; readonly loss: number };
  /** Mindestzahl Teilnehmer, damit ein Zyklus startet. */
  readonly minPlayers: number;
}

/** Ergebnis eines Charakters im letzten Zyklus, für die Einteilung des nächsten. */
export interface PreviousPlacement {
  /** Position der Division von oben (0 = oberste). */
  readonly division: number;
  /** Platz in der Abschlusstabelle (1 = Erster). */
  readonly place: number;
  readonly movement: 'up' | 'down' | 'stay';
}

export interface LeagueEntrant {
  readonly characterId: string;
  readonly rating: number;
  readonly previous: PreviousPlacement | null;
}

/**
 * Teilt die Teilnehmer in Divisionen ein (oberste zuerst). Wer schon gespielt hat, behält seine
 * Division, Aufsteiger rücken ans Ende der Division darüber, Absteiger an den Anfang der Division
 * darunter. Neue Teilnehmer reihen sich nach Rating vor dem ersten Bisherigen mit niedrigerem
 * Rating ein. Die Reihenfolge wird dann gleichmäßig in möglichst wenige Divisionen geschnitten
 * (Zielgröße, höchstens `maxDivisionSize`).
 */
export function formDivisions(rules: LeagueRules, entrants: readonly LeagueEntrant[]): string[][] {
  const returning = entrants
    .filter((e) => e.previous)
    .map((e) => {
      const p = e.previous!;
      // Aufsteiger hinter alle der Division darüber, Absteiger vor alle der Division darunter
      const seed =
        p.movement === 'up'
          ? (p.division - 1) * 1000 + 500 + p.place
          : p.movement === 'down'
            ? (p.division + 1) * 1000 - 500 + p.place
            : p.division * 1000 + p.place;
      return { id: e.characterId, rating: e.rating, seed };
    })
    .sort((a, b) => a.seed - b.seed || b.rating - a.rating || cmp(a.id, b.id));
  const order: { id: string; rating: number; seed: number }[] = [...returning];
  const newcomers = entrants
    .filter((e) => !e.previous)
    .sort((a, b) => b.rating - a.rating || cmp(a.characterId, b.characterId));
  for (const n of newcomers) {
    // vor dem ersten Bisherigen mit niedrigerem Rating (Neue untereinander bleiben nach Rating)
    const at = order.findIndex((r) => r.seed !== Infinity && r.rating < n.rating);
    const entry = { id: n.characterId, rating: n.rating, seed: Infinity };
    if (at < 0) order.push(entry);
    else order.splice(at, 0, entry);
  }
  return chunk(
    order.map((o) => o.id),
    rules,
  );
}

function chunk(ids: readonly string[], rules: LeagueRules): string[][] {
  if (ids.length < Math.max(2, rules.minPlayers)) return [];
  // So wenige Divisionen wie möglich mit Zielgröße; zu große werden geteilt
  let count = Math.max(1, Math.floor(ids.length / Math.max(2, rules.divisionSize)));
  while (Math.ceil(ids.length / count) > Math.max(2, rules.maxDivisionSize)) count++;
  // Gleichmäßig schneiden, größere Divisionen oben; die Reihenfolge bleibt erhalten
  const base = Math.floor(ids.length / count);
  const extra = ids.length - base * count;
  const out: string[][] = [];
  let from = 0;
  for (let i = 0; i < count; i++) {
    const n = base + (i < extra ? 1 : 0);
    out.push(ids.slice(from, from + n));
    from += n;
  }
  return out;
}

/** Eine Paarung eines Spieltags; `b` = null heißt spielfrei. */
export interface Pairing {
  readonly a: string;
  readonly b: string | null;
}

/**
 * Spielplan nach dem Kreisverfahren: Jeder spielt einmal gegen jeden, ein Spieltag je Runde. Bei
 * ungerader Zahl ist pro Spieltag einer spielfrei. Die Heimseite (erstes Team) wechselt.
 */
export function roundRobin(ids: readonly string[]): Pairing[][] {
  const list: (string | null)[] = [...ids];
  if (list.length % 2 === 1) list.push(null);
  const n = list.length;
  const rounds: Pairing[][] = [];
  for (let r = 0; r < n - 1; r++) {
    const day: Pairing[] = [];
    for (let i = 0; i < n / 2; i++) {
      const x = list[i]!;
      const y = list[n - 1 - i]!;
      if (x === null && y === null) continue;
      if (x === null || y === null) {
        day.push({ a: (x ?? y)!, b: null });
        continue;
      }
      // Seiten tauschen, damit niemand immer als erstes Team antritt
      day.push((r + i) % 2 === 0 ? { a: x, b: y } : { a: y, b: x });
    }
    rounds.push(day);
    // Rotation: erster bleibt, der Rest dreht sich
    list.splice(1, 0, list.pop()!);
  }
  return rounds;
}

export interface MatchResult {
  readonly a: string;
  readonly b: string;
  /** Sieger-ID oder null bei Unentschieden. */
  readonly winner: string | null;
}

export interface StandingRow {
  readonly characterId: string;
  readonly played: number;
  readonly wins: number;
  readonly draws: number;
  readonly losses: number;
  readonly points: number;
  readonly place: number;
  readonly movement: 'up' | 'down' | 'stay';
}

/**
 * Tabelle einer Division: Punkte, dann Siege, dann direkter Vergleich (Punkte untereinander),
 * dann Rating, zuletzt die ID. `division` und `divisions` bestimmen Auf- und Abstieg.
 */
export function standings(
  rules: LeagueRules,
  input: {
    members: readonly { characterId: string; rating: number }[];
    results: readonly MatchResult[];
    division: number;
    divisions: number;
  },
): StandingRow[] {
  const rows = new Map(
    input.members.map((m) => [
      m.characterId,
      {
        characterId: m.characterId,
        rating: m.rating,
        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        points: 0,
      },
    ]),
  );
  for (const r of input.results) {
    const a = rows.get(r.a);
    const b = rows.get(r.b);
    if (!a || !b) continue;
    a.played++;
    b.played++;
    if (r.winner === null) {
      a.draws++;
      b.draws++;
    } else {
      const [w, l] = r.winner === r.a ? [a, b] : [b, a];
      w.wins++;
      l.losses++;
    }
  }
  for (const row of rows.values())
    row.points =
      row.wins * rules.points.win + row.draws * rules.points.draw + row.losses * rules.points.loss;

  const headToHead = (x: string, y: string) => {
    let px = 0;
    let py = 0;
    for (const r of input.results) {
      if (!((r.a === x && r.b === y) || (r.a === y && r.b === x))) continue;
      if (r.winner === null) {
        px += rules.points.draw;
        py += rules.points.draw;
      } else if (r.winner === x) px += rules.points.win;
      else py += rules.points.win;
    }
    return py - px;
  };
  const sorted = [...rows.values()].sort(
    (x, y) =>
      y.points - x.points ||
      y.wins - x.wins ||
      headToHead(x.characterId, y.characterId) ||
      y.rating - x.rating ||
      cmp(x.characterId, y.characterId),
  );
  const n = sorted.length;
  const up = input.division > 0 ? Math.min(rules.promote, Math.floor(n / 2)) : 0;
  const down =
    input.division < input.divisions - 1 ? Math.min(rules.relegate, Math.floor(n / 2)) : 0;
  return sorted.map(({ rating: _rating, ...row }, i) => ({
    ...row,
    place: i + 1,
    movement: i < up ? 'up' : i >= n - down ? 'down' : 'stay',
  }));
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
