import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import {
  SEASON_JOB_IDS,
  type AdminAccountView,
  type AdminJobResult,
  type AdminSeasonResetResult,
  type AdminSeasonView,
  type DailyLimitKind,
  type SeasonJobId,
} from '@tbca/shared';

import { AdminService } from '../../core/admin.service';
import { ApiFailure } from '../../core/api-failure';
import { LanguageService } from '../../core/language.service';

/**
 * Steuerung der laufenden Season: Kennzahlen des Tages, Tageslimits zurücksetzen (alle oder
 * ein Spieler), Hintergrund-Jobs sofort ausführen, Season-Ende verschieben und – als
 * Gefahrenzone mit Slug-Bestätigung – die Season zurücksetzen.
 */
@Component({
  selector: 'tbca-season-page',
  imports: [TranslocoDirective, RouterLink],
  templateUrl: './season.page.html',
  styleUrls: ['./admin.page.css', './season.page.css'],
})
export class SeasonPage {
  private readonly api = inject(AdminService);
  private readonly lang = inject(LanguageService);

  protected readonly jobs = SEASON_JOB_IDS;
  protected readonly limitKinds: DailyLimitKind[] = ['dungeon', 'fights', 'passive'];
  protected readonly view = signal<AdminSeasonView | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);

  // Tageslimits
  protected readonly kinds = signal<Set<DailyLimitKind>>(new Set(['dungeon', 'fights']));
  protected readonly scope = signal<'all' | 'player'>('all');
  protected readonly query = signal('');
  protected readonly found = signal<AdminAccountView[]>([]);
  protected readonly player = signal<AdminAccountView | null>(null);
  protected readonly reason = signal('');

  // Jobs
  protected readonly jobResult = signal<AdminJobResult | null>(null);

  // Season-Ende
  protected readonly endsAt = signal('');

  // Zurücksetzen
  protected readonly resetMode = signal<'progress' | 'wipe'>('progress');
  protected readonly confirm = signal('');
  protected readonly resetReason = signal('');
  protected readonly resetResult = signal<AdminSeasonResetResult | null>(null);

  protected readonly canResetDaily = computed(
    () =>
      this.kinds().size > 0 &&
      this.reason().trim().length >= 3 &&
      (this.scope() === 'all' || this.player() !== null),
  );
  protected readonly canResetSeason = computed(
    () =>
      this.confirm().trim() === this.view()?.season.slug && this.resetReason().trim().length >= 3,
  );

  constructor() {
    void this.run(async () => this.show(await this.api.season()));
  }

  protected toggleKind(kind: DailyLimitKind): void {
    const next = new Set(this.kinds());
    if (next.has(kind)) next.delete(kind);
    else next.add(kind);
    this.kinds.set(next);
  }

  protected async search(): Promise<void> {
    const q = this.query().trim();
    if (q.length < 2) return;
    await this.run(async () => this.found.set(await this.api.accounts(q)));
  }

  protected pick(account: AdminAccountView): void {
    this.player.set(account);
    this.found.set([]);
  }

  protected resetDaily(): Promise<void> {
    return this.run(async () => {
      const accountId = this.scope() === 'player' ? (this.player()?.accountId ?? null) : null;
      this.show(await this.api.resetDaily([...this.kinds()], accountId, this.reason().trim()));
      this.reason.set('');
      this.notice.set('admin.season.daily.done');
    });
  }

  protected runJob(job: SeasonJobId): Promise<void> {
    return this.run(async () => {
      this.jobResult.set(await this.api.runJob(job));
      this.show(await this.api.season());
    });
  }

  protected saveEnd(): Promise<void> {
    const value = this.endsAt();
    if (!value) return Promise.resolve();
    return this.run(async () => {
      this.show(await this.api.setSeasonEnd(new Date(value).toISOString()));
      this.notice.set('admin.season.end.done');
    });
  }

  protected resetSeason(): Promise<void> {
    return this.run(async () => {
      this.resetResult.set(
        await this.api.resetSeason(this.resetMode(), this.confirm().trim(), this.resetReason()),
      );
      this.confirm.set('');
      this.resetReason.set('');
      this.show(await this.api.season());
    });
  }

  /** Ergebnis eines Jobs als kurze Schlüssel-Wert-Liste. */
  protected entries(result: Record<string, unknown>): { key: string; value: string }[] {
    return Object.entries(result).map(([key, value]) => ({
      key,
      value: typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value),
    }));
  }

  protected formatDate(iso: string): string {
    if (!iso) return '–';
    return new Intl.DateTimeFormat(this.lang.current(), {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso));
  }

  protected input(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  private show(view: AdminSeasonView): void {
    this.view.set(view);
    this.endsAt.set(toLocalInput(view.season.endsAt));
  }

  private async run(fn: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      await fn();
    } catch (error) {
      this.error.set(error instanceof ApiFailure ? error.code : 'unknown');
    } finally {
      this.busy.set(false);
    }
  }
}

/** ISO-Zeitpunkt → Wert für `<input type="datetime-local">` in lokaler Zeit. */
function toLocalInput(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
