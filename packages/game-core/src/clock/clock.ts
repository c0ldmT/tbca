/**
 * Zentraler Clock-Service (Spezifikation, Abschnitt 14 „Testbetrieb & Zeitsteuerung“).
 *
 * Alle zeitabhängigen Spielabläufe (Tageslimits, Cooldowns, Spieltage, Season-Ende)
 * lesen die Zeit hier und nie direkt aus der Systemuhr. Dadurch lassen sich
 * Test-Seasons beschleunigen (Zeitfaktor) und vorspulen, ohne Sonderlogik im Spiel.
 *
 * Begriffe:
 * - Echtzeit: die Uhr des Rechners (Millisekunden seit Epoch).
 * - Spielzeit: die Zeit, die das Spiel sieht. Ohne Zeitfaktor und Vorspulen gleich der Echtzeit.
 *
 * Dauern im Spiel (z. B. „Cooldown 60 s“) werden immer in Spielzeit angegeben;
 * ein Zeitfaktor beschleunigt damit automatisch alle Limits, Cooldowns und Spieltage.
 */

/** Liefert die Echtzeit in Millisekunden seit Epoch. */
export type TimeSource = () => number;

/** Lesender Zugriff auf die Spielzeit; das, was Spiellogik als Abhängigkeit bekommt. */
export interface Clock {
  /** Spielzeit in Millisekunden seit Epoch. */
  now(): number;
}

/** Echtzeit der Systemuhr. Die einzige Stelle in game-core, die sie lesen darf. */
// eslint-disable-next-line no-restricted-globals -- bewusst: einzige Quelle der Echtzeit
export const systemTimeSource: TimeSource = () => Date.now();

/** Von Hand gesteuerte Echtzeit für Tests. */
export class ManualTimeSource {
  constructor(private current = 0) {}

  readonly read: TimeSource = () => this.current;

  set(ms: number): void {
    this.current = ms;
  }

  tick(ms: number): void {
    this.current += ms;
  }
}

export interface GameClockOptions {
  /** Echtzeitquelle; Standard ist die Systemuhr. */
  source?: TimeSource;
  /** Zeitfaktor: 1 = Echtzeit, 24 = ein Spieltag pro Stunde. */
  factor?: number;
  /** Spielzeit beim Erzeugen; Standard ist die aktuelle Echtzeit. */
  start?: number;
}

function assertFactor(factor: number): number {
  if (!Number.isFinite(factor) || factor <= 0) {
    throw new RangeError(`Zeitfaktor muss eine positive Zahl sein, erhalten: ${factor}`);
  }
  return factor;
}

function assertDuration(ms: number): number {
  if (!Number.isSafeInteger(ms) || ms < 0) {
    throw new RangeError(`Dauer muss eine nicht-negative ganze Zahl sein, erhalten: ${ms}`);
  }
  return ms;
}

/**
 * Spieluhr mit Zeitfaktor und Vorspulen.
 *
 * Intern merkt sie sich einen Ankerpunkt (Echtzeit ↔ Spielzeit). Ändert sich der
 * Zeitfaktor, wird neu verankert, sodass die Spielzeit nie springt oder rückwärts läuft.
 */
export class GameClock implements Clock {
  private readonly source: TimeSource;
  private factor: number;
  private anchorReal: number;
  private anchorGame: number;

  constructor(options: GameClockOptions = {}) {
    this.source = options.source ?? systemTimeSource;
    this.factor = assertFactor(options.factor ?? 1);
    this.anchorReal = this.source();
    this.anchorGame = options.start ?? this.anchorReal;
  }

  now(): number {
    const elapsedReal = this.source() - this.anchorReal;
    return this.anchorGame + Math.floor(elapsedReal * this.factor);
  }

  /** Aktueller Zeitfaktor. */
  getFactor(): number {
    return this.factor;
  }

  /** Setzt den Zeitfaktor ab jetzt; die bisherige Spielzeit bleibt erhalten. */
  setFactor(factor: number): void {
    assertFactor(factor);
    this.reanchor(this.now());
    this.factor = factor;
  }

  /** Spult die Spielzeit um `ms` Millisekunden vor. Zurückspulen ist nicht möglich. */
  advance(ms: number): void {
    this.reanchor(this.now() + assertDuration(ms));
  }

  /** Spult bis zum Zeitpunkt `gameTime` vor (muss in der Zukunft liegen oder jetzt sein). */
  advanceTo(gameTime: number): void {
    const now = this.now();
    if (gameTime < now) {
      throw new RangeError(`Zurückspulen ist nicht möglich (${gameTime} < ${now})`);
    }
    this.reanchor(gameTime);
  }

  /**
   * Wie lange in Echtzeit gewartet werden muss, bis `gameMs` Spielzeit vergangen sind,
   * z. B. für Timer oder verzögerte Jobs. Aufgerundet, damit nie zu früh ausgelöst wird.
   */
  toRealDelay(gameMs: number): number {
    return Math.ceil(assertDuration(gameMs) / this.factor);
  }

  /**
   * Spult um `ms` vor und arbeitet dabei alle fälligen Timer der Warteschlange in der
   * richtigen Reihenfolge ab. Während ein Timer läuft, zeigt die Uhr genau seinen
   * Fälligkeitszeitpunkt. Timer, die der Handler neu einplant, werden mit abgearbeitet,
   * sofern sie noch im Zeitfenster liegen.
   *
   * @returns Anzahl der ausgeführten Timer.
   */
  async fastForward<T>(
    ms: number,
    queue: TimerQueue<T>,
    run: (timer: Timer<T>) => void | Promise<void>,
  ): Promise<number> {
    const target = this.now() + assertDuration(ms);
    let executed = 0;
    for (;;) {
      const next = queue.peek();
      if (!next || next.at > target) break;
      queue.cancel(next.id);
      if (next.at > this.now()) this.reanchor(next.at);
      await run(next);
      executed++;
    }
    if (target > this.now()) this.reanchor(target);
    return executed;
  }

  private reanchor(gameTime: number): void {
    this.anchorReal = this.source();
    this.anchorGame = gameTime;
  }
}

/** Ein eingeplanter Timer. */
export interface Timer<T> {
  readonly id: number;
  /** Fälligkeit in Spielzeit. */
  readonly at: number;
  readonly payload: T;
}

/**
 * Nach Fälligkeit sortierte Warteschlange. Bei gleicher Fälligkeit gilt die
 * Reihenfolge des Einplanens, damit Abläufe reproduzierbar sind.
 */
export class TimerQueue<T> {
  private timers: Timer<T>[] = [];
  private nextId = 1;

  get size(): number {
    return this.timers.length;
  }

  schedule(at: number, payload: T): number {
    if (!Number.isSafeInteger(at)) throw new RangeError(`Ungültiger Zeitpunkt: ${at}`);
    const timer: Timer<T> = { id: this.nextId++, at, payload };
    // Einfügen hinter allen Timern mit at <= timer.at (stabil).
    let lo = 0;
    let hi = this.timers.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.timers[mid]!.at <= at) lo = mid + 1;
      else hi = mid;
    }
    this.timers.splice(lo, 0, timer);
    return timer.id;
  }

  cancel(id: number): boolean {
    const index = this.timers.findIndex((t) => t.id === id);
    if (index < 0) return false;
    this.timers.splice(index, 1);
    return true;
  }

  peek(): Timer<T> | undefined {
    return this.timers[0];
  }

  /** Entnimmt alle Timer mit Fälligkeit <= `now` in Reihenfolge. */
  takeDue(now: number): Timer<T>[] {
    let count = 0;
    while (count < this.timers.length && this.timers[count]!.at <= now) count++;
    return this.timers.splice(0, count);
  }
}
