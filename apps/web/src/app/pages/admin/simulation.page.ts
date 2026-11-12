import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { CLASS_IDS, type ClassId, type MatchupCell, type TeamSimResult } from '@tbca/game-core';
import type { AdminConfigList, AdminSimulationReport, AdminSimulationResponse } from '@tbca/shared';
import { SIM_TEAM_MAX_SAMPLES } from '@tbca/shared/constants';

import { AdminService } from '../../core/admin.service';
import { ApiFailure } from '../../core/api-failure';
import { downloadJson, downloadText, toCsv } from '../../core/download';

type Kind = 'matchups' | 'dungeon' | 'teams';
type Gear = 'none' | 'common' | 'rare' | 'epic';

/** Divergierende Skala um 50 %: Pole und neutrale Mitte (gegen die dunkle Fläche geprüft). */
const WIN = '#1A9FB0';
const LOSS = '#E8336F';
const MID = '#3B4054';

const TEAM_HEADER = [
  'size',
  'level',
  'gear',
  'comp',
  'wins',
  'losses',
  'draws',
  'winPermille',
  'avgRounds',
  'worstOpponent',
  'worstPermille',
];

/**
 * Balancing-Simulation (Spezifikation, Abschnitt 14): Gewinnraten-Matrix Klasse × Klasse,
 * Team-Aufstellungen (2v2, 3v3) und Verteilung der Dungeon-Tiefe gegen eine Konfigurationsversion – optional im Vergleich zur
 * veröffentlichten, damit ein Entwurf vor dem Veröffentlichen geprüft werden kann.
 */
@Component({
  selector: 'tbca-simulation-page',
  imports: [TranslocoDirective, RouterLink],
  templateUrl: './simulation.page.html',
  styleUrls: ['./item-editor.page.css', './simulation.page.css'],
})
export class SimulationPage {
  private readonly api = inject(AdminService);

  protected readonly classes = CLASS_IDS;
  protected readonly gears: Gear[] = ['none', 'common', 'rare', 'epic'];
  protected readonly list = signal<AdminConfigList | null>(null);
  protected readonly kind = signal<Kind>('matchups');
  protected readonly version = signal<number | null>(null);
  protected readonly level = signal(20);
  protected readonly gear = signal<Gear>('common');
  protected readonly samples = signal(100);
  protected readonly teamSize = signal<2 | 3>(3);
  protected readonly teamMax = SIM_TEAM_MAX_SAMPLES;
  protected readonly compare = signal(true);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly result = signal<AdminSimulationResponse | null>(null);
  protected readonly baseline = signal<AdminSimulationResponse | null>(null);
  protected readonly reportFights = signal(60);
  protected readonly reportRuns = signal(20);
  protected readonly reportTeamFights = signal(8);
  protected readonly report = signal<AdminSimulationReport | null>(null);
  protected readonly reportBusy = signal(false);

  protected readonly published = computed(
    () => this.list()?.versions.find((v) => v.status === 'published')?.version ?? null,
  );
  /** Vergleich nur sinnvoll, wenn nicht ohnehin die veröffentlichte Version läuft. */
  protected readonly canCompare = computed(
    () => this.version() !== null && this.version() !== this.published(),
  );

  /** Höchste Säule des Histogramms für die Skalierung. */
  protected readonly histMax = computed(() =>
    Math.max(1, ...(this.result()?.dungeon?.histogram ?? [0])),
  );

  /** Obergrenze der Stichprobe für die gewählte Art. */
  protected readonly samplesMax = computed(() =>
    this.kind() === 'teams' ? SIM_TEAM_MAX_SAMPLES : 400,
  );

  constructor() {
    void this.load();
  }

  protected setKind(kind: Kind): void {
    this.kind.set(kind);
    // Team-Läufe sind teurer: Stichprobe beim Wechsel auf die Obergrenze kürzen
    if (this.samples() > this.samplesMax()) this.samples.set(Math.min(20, this.samplesMax()));
  }

  private async load(): Promise<void> {
    try {
      const list = await this.api.configs();
      this.list.set(list);
      const draft = list.versions.find((v) => v.status === 'draft');
      this.version.set(draft?.version ?? this.published());
    } catch (error) {
      this.error.set(error instanceof ApiFailure ? error.code : 'unknown');
    }
  }

  protected async run(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    const req = {
      kind: this.kind(),
      level: this.level(),
      gear: this.gear(),
      samples: Math.min(this.samples(), this.samplesMax()),
      teamSize: this.teamSize(),
      ...(this.version() ? { version: this.version()! } : {}),
    };
    try {
      const [main, base] = await Promise.all([
        this.api.simulate(req),
        this.compare() && this.canCompare()
          ? this.api.simulate({ ...req, version: this.published()! })
          : Promise.resolve(null),
      ]);
      this.result.set(main);
      this.baseline.set(base);
    } catch (error) {
      this.error.set(error instanceof ApiFailure ? error.code : 'unknown');
    } finally {
      this.busy.set(false);
    }
  }

  /** Aktuelles Ergebnis (und ggf. Vergleich) als JSON-Datei. */
  protected exportJson(): void {
    const r = this.result();
    if (!r) return;
    downloadJson(
      `tbca-sim-${r.matchups ? 'matrix' : r.teams ? `teams${r.teams.size}` : 'dungeon'}-v${r.version}-L${this.level()}.json`,
      {
        format: 'tbca-sim/v1',
        request: {
          kind: this.kind(),
          level: this.level(),
          gear: this.gear(),
          samples: this.samples(),
          ...(r.teams ? { teamSize: r.teams.size } : {}),
        },
        result: r,
        baseline: this.baseline(),
      },
    );
  }

  /** Aktuelles Ergebnis als CSV: Matrix-Zellen bzw. Tiefe je Klasse und Histogramm. */
  protected exportCsv(): void {
    const r = this.result();
    if (!r) return;
    const rows: (string | number | null)[][] = [];
    if (r.matchups) {
      rows.push(['level', 'gear', 'a', 'b', 'wins', 'losses', 'draws', 'winPermille', 'avgRounds']);
      for (const c of r.matchups.cells)
        rows.push([
          r.matchups.level,
          r.matchups.gear,
          c.a,
          c.b,
          c.wins,
          c.losses,
          c.draws,
          c.winPermille,
          c.avgRounds,
        ]);
    } else if (r.dungeon) {
      rows.push(['level', 'gear', 'class', 'average', 'best']);
      for (const c of this.classes)
        rows.push([
          r.dungeon.level,
          r.dungeon.gear,
          c,
          r.dungeon.perClass[c].average,
          r.dungeon.perClass[c].best,
        ]);
      rows.push([]);
      rows.push(['floor', 'runs']);
      r.dungeon.histogram.forEach((n, floor) => rows.push([floor, n]));
    } else if (r.teams) {
      rows.push(...this.teamRows(r.teams, null));
    }
    downloadText(`tbca-sim-v${r.version}-L${this.level()}.csv`, toCsv(rows), 'text/csv');
  }

  /** Report über alle Stufen erstellen und direkt als JSON herunterladen. */
  protected async runReport(): Promise<void> {
    this.reportBusy.set(true);
    this.error.set(null);
    try {
      const report = await this.api.simulationReport({
        fights: this.reportFights(),
        runs: this.reportRuns(),
        teamFights: this.reportTeamFights(),
        ...(this.version() ? { version: this.version()! } : {}),
      });
      this.report.set(report);
      downloadJson(
        `tbca-sim-report-v${report.version}-${report.generatedAt.slice(0, 10)}.json`,
        report,
      );
    } catch (error) {
      this.error.set(error instanceof ApiFailure ? error.code : 'unknown');
    } finally {
      this.reportBusy.set(false);
    }
  }

  /** Report als CSV im Langformat (eine Zeile je Stufe und Paarung). */
  protected exportReportCsv(): void {
    const report = this.report();
    if (!report) return;
    const rows: (string | number | null)[][] = [
      ['version', 'level', 'gear', 'a', 'b', 'wins', 'losses', 'draws', 'winPermille', 'avgRounds'],
    ];
    for (const p of report.points)
      for (const c of p.matchups.cells)
        rows.push([
          report.version,
          p.level,
          p.gear,
          c.a,
          c.b,
          c.wins,
          c.losses,
          c.draws,
          c.winPermille,
          c.avgRounds,
        ]);
    rows.push([]);
    rows.push(['version', 'level', 'gear', 'class', 'dungeonAverage', 'dungeonBest']);
    for (const p of report.points)
      for (const c of this.classes)
        rows.push([
          report.version,
          p.level,
          p.gear,
          c,
          p.dungeon.perClass[c].average,
          p.dungeon.perClass[c].best,
        ]);
    const teams = report.points.flatMap((p) => [p.teams2, p.teams3]).filter((x) => x !== null);
    if (teams.length) {
      rows.push([]);
      rows.push(['version', ...TEAM_HEADER]);
      for (const sim of teams)
        for (const row of this.teamRows(sim, report.version).slice(1)) rows.push(row);
    }
    downloadText(`tbca-sim-report-v${report.version}.csv`, toCsv(rows), 'text/csv');
  }

  /** CSV-Zeilen einer Team-Simulation (mit Kopfzeile); optional mit Version vorne. */
  private teamRows(sim: TeamSimResult, version: number | null): (string | number | null)[][] {
    const head = version === null ? [] : [version];
    return [
      [...(version === null ? [] : ['version']), ...TEAM_HEADER],
      ...sim.comps.map((c) => [
        ...head,
        sim.size,
        sim.level,
        sim.gear,
        c.classes.join('+'),
        c.wins,
        c.losses,
        c.draws,
        c.winPermille,
        c.avgRounds,
        c.worst?.classes.join('+') ?? null,
        c.worst?.winPermille ?? null,
      ]),
    ];
  }

  /** Ausreißer kommen als eigene Objekte aus dem JSON – Vergleich über die Klassen. */
  protected isOutlier(sim: TeamSimResult, classes: readonly ClassId[]): boolean {
    const key = classes.join('+');
    return sim.outliers.some((o) => o.classes.join('+') === key);
  }

  /** Übersetzer für Klassennamen aus dem Template-Kontext. */
  protected className(t: (key: string) => string): (c: ClassId) => string {
    return (c) => t('classes.' + c);
  }

  /** Klassen einer Aufstellung als lesbarer Text, z. B. „Bruiser + Medtech“. */
  protected compLabel(classes: readonly ClassId[], name: (c: ClassId) => string): string {
    return classes.map(name).join(' + ');
  }

  /** Veränderung des Team-Beitrags je Klasse gegenüber der veröffentlichten Version. */
  protected teamDelta(classId: ClassId): number | null {
    const now = this.result()?.teams?.perClass[classId];
    const before = this.baseline()?.teams?.perClass[classId];
    return now === undefined || before === undefined ? null : Math.round((now - before) / 10);
  }

  protected cell(a: ClassId, b: ClassId): MatchupCell | undefined {
    return this.result()?.matchups?.cells.find((c) => c.a === a && c.b === b);
  }

  /** Füllfarbe einer Zelle: je weiter von 50 %, desto kräftiger der Pol. */
  protected fill(winPermille: number): string {
    const strength = Math.min(100, Math.round((Math.abs(winPermille - 500) / 400) * 100));
    return `color-mix(in oklab, ${winPermille >= 500 ? WIN : LOSS} ${strength}%, ${MID})`;
  }

  protected percent(permille: number): string {
    return `${Math.round(permille / 10)} %`;
  }

  /** Veränderung der Gesamtquote gegenüber der veröffentlichten Version in Prozentpunkten. */
  protected delta(classId: ClassId): number | null {
    const now = this.result()?.matchups?.overall[classId];
    const before = this.baseline()?.matchups?.overall[classId];
    return now === undefined || before === undefined ? null : Math.round((now - before) / 10);
  }

  protected dungeonDelta(classId: ClassId): number | null {
    const now = this.result()?.dungeon?.perClass[classId]?.average;
    const before = this.baseline()?.dungeon?.perClass[classId]?.average;
    return now === undefined || before === undefined ? null : Math.round((now - before) * 10) / 10;
  }

  protected signed(n: number): string {
    return n > 0 ? `+${n}` : String(n);
  }

  protected numberInput(target: EventTarget | null, min: number, max: number): number {
    const value = Math.round(Number((target as HTMLInputElement | null)?.value));
    return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
  }
}
