import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { CLASS_IDS, type ClassId, type MatchupCell } from '@tbca/game-core';
import type { AdminConfigList, AdminSimulationReport, AdminSimulationResponse } from '@tbca/shared';

import { AdminService } from '../../core/admin.service';
import { ApiFailure } from '../../core/api-failure';
import { downloadJson, downloadText, toCsv } from '../../core/download';

type Kind = 'matchups' | 'dungeon';
type Gear = 'none' | 'common' | 'rare' | 'epic';

/** Divergierende Skala um 50 %: Pole und neutrale Mitte (gegen die dunkle Fläche geprüft). */
const WIN = '#1A9FB0';
const LOSS = '#E8336F';
const MID = '#3B4054';

/**
 * Balancing-Simulation (Spezifikation, Abschnitt 14): Gewinnraten-Matrix Klasse × Klasse und
 * Verteilung der Dungeon-Tiefe gegen eine Konfigurationsversion – optional im Vergleich zur
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
  protected readonly compare = signal(true);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly result = signal<AdminSimulationResponse | null>(null);
  protected readonly baseline = signal<AdminSimulationResponse | null>(null);
  protected readonly reportFights = signal(60);
  protected readonly reportRuns = signal(20);
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

  constructor() {
    void this.load();
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
      samples: this.samples(),
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
      `tbca-sim-${r.matchups ? 'matrix' : 'dungeon'}-v${r.version}-L${this.level()}.json`,
      {
        format: 'tbca-sim/v1',
        request: {
          kind: this.kind(),
          level: this.level(),
          gear: this.gear(),
          samples: this.samples(),
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
    downloadText(`tbca-sim-report-v${report.version}.csv`, toCsv(rows), 'text/csv');
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
