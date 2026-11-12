import { Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';

import { AuthService } from '../../core/auth.service';
import { LanguageService } from '../../core/language.service';
import { GlitchDirective } from '../../shared/glitch.directive';
import { HUBS } from '../../shared/hubs';
import { Bar } from '../../shared/ui/bar';
import { ClassBadge } from '../../shared/ui/class-badge';
import { translateLine, type LogLine } from '../../shared/battle-log';
import { DEMO_FIGHTERS, DEMO_SEED, runDemoBattle, toDemoLogLines } from './demo-battle';

const LOGIN_RESULTS = ['success', 'cancelled', 'failed'] as const;
type LoginResult = (typeof LOGIN_RESULTS)[number];

@Component({
  selector: 'tbca-home-page',
  imports: [TranslocoDirective, GlitchDirective, RouterLink, Bar, ClassBadge],
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
  protected readonly devName = signal('');
  protected readonly devFailed = signal(false);

  constructor() {
    void this.auth.loadOptions();
  }

  /** Test-Anmeldung ohne Discord (nur in der Entwicklung mit DEV_LOGIN=true). */
  protected async devLogin(): Promise<void> {
    this.devFailed.set(false);
    try {
      await this.auth.devLogin(this.devName().trim());
    } catch {
      this.devFailed.set(true);
    }
  }
  protected readonly hubs = HUBS;
  /** Versetzte Glitch-Takte, damit die Kacheln nicht gleichzeitig zucken. */
  protected readonly glitch = ['a', 'c', 'e', 'b'];

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
    return toDemoLogLines(this.result().events, format);
  });
  protected readonly outcome = computed(() => this.lines().at(-1));

  protected text(
    line: LogLine,
    t: (key: string, params?: Record<string, unknown>) => string,
  ): string {
    return translateLine(line, t);
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
