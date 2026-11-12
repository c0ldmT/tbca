import { Component, computed, inject, input, signal } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';

import { AuthService } from '../../core/auth.service';
import { LanguageService } from '../../core/language.service';
import { GlitchDirective } from '../../shared/glitch.directive';
import { DEMO_FIGHTERS, DEMO_SEED, runDemoBattle, toLogLines, type LogLine } from './demo-battle';

const LOGIN_RESULTS = ['success', 'cancelled', 'failed'] as const;
type LoginResult = (typeof LOGIN_RESULTS)[number];

@Component({
  selector: 'tbca-home-page',
  imports: [TranslocoDirective, GlitchDirective],
  templateUrl: './home.page.html',
  styleUrl: './home.page.css',
})
export class HomePage {
  protected readonly auth = inject(AuthService);
  private readonly language = inject(LanguageService);

  /** Query-Parameter ?login=… nach der Rückkehr von Discord. */
  readonly login = input<string>();
  protected readonly loginResult = computed<LoginResult | null>(() => {
    const result = LOGIN_RESULTS.find((r) => r === this.login()) ?? null;
    // „Angemeldet“ nur bestätigen, wenn die Session tatsächlich besteht.
    return result === 'success' && !this.auth.user() ? null : result;
  });
  protected readonly logoutFailed = signal(false);

  protected readonly seed = signal(DEMO_SEED);
  protected readonly result = computed(() => runDemoBattle(this.seed()));
  protected readonly fighters = computed(() => {
    const survivors = new Map(this.result().survivors.map((s) => [s.id, s.hp]));
    return DEMO_FIGHTERS.map((f) => {
      const hp = survivors.get(f.id) ?? 0;
      return {
        name: f.name,
        classId: f.classId,
        hp,
        max: f.stats.maxHp,
        percent: (hp / f.stats.maxHp) * 100,
      };
    });
  });
  protected readonly lines = computed(() => {
    const locale = this.language.current();
    const format = (n: number) => n.toLocaleString(locale, { maximumFractionDigits: 1 });
    return toLogLines(this.result().events, format);
  });
  protected readonly outcome = computed(() => this.lines().at(-1));

  /** Setzt übersetzte Namen (Fähigkeit, Status) in die Parameter einer Zeile ein. */
  protected paramsOf(line: LogLine, t: (key: string) => string): Record<string, string | number> {
    if (!line.nested) return line.params;
    const resolved: Record<string, string | number> = { ...line.params };
    for (const [param, key] of Object.entries(line.nested)) resolved[param] = t(key);
    return resolved;
  }

  protected rerun(): void {
    const bytes = crypto.getRandomValues(new Uint8Array(6));
    this.seed.set(Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(''));
  }

  protected async logout(): Promise<void> {
    this.logoutFailed.set(false);
    try {
      await this.auth.logout();
    } catch {
      this.logoutFailed.set(true);
    }
  }
}
