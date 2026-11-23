import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import type {
  AdminAccountView,
  AdminAuditView,
  AdminBotView,
  AdminTimeView,
  BotRunResult,
} from '@tbca/shared';

import { AdminService } from '../../core/admin.service';
import { ApiFailure } from '../../core/api-failure';
import { AuthService } from '../../core/auth.service';

const HOUR = 3_600_000;

/** Admin-Bereich für Superadmins: Zeitsteuerung, Spieler, Audit-Log. */
@Component({
  selector: 'tbca-admin-page',
  imports: [TranslocoDirective, RouterLink],
  templateUrl: './admin.page.html',
  styleUrl: './admin.page.css',
})
export class AdminPage {
  protected readonly auth = inject(AuthService);
  private readonly api = inject(AdminService);

  protected readonly steps = [
    { key: 'hour', ms: HOUR },
    { key: 'day', ms: 24 * HOUR },
    { key: 'week', ms: 7 * 24 * HOUR },
  ] as const;
  protected readonly time = signal<AdminTimeView | null>(null);
  protected readonly accounts = signal<AdminAccountView[]>([]);
  protected readonly audit = signal<AdminAuditView[]>([]);
  protected readonly bots = signal<AdminBotView[]>([]);
  protected readonly botRun = signal<BotRunResult | null>(null);
  protected readonly agents = ['casual', 'active', 'farmer', 'climber', 'class_switcher'] as const;
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly factor = signal(1);
  protected readonly query = signal('');
  /** Eingaben je Account: Betrag und Begründung. */
  protected readonly forms = signal<Record<string, { amount: string; reason: string }>>({});

  protected readonly isAdmin = computed(
    () => this.auth.user()?.account.globalRole === 'superadmin',
  );

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    await this.run(async () => {
      if (this.auth.state() === undefined) await this.auth.refresh();
      if (!this.isAdmin()) return;
      const [time, audit, bots] = await Promise.all([
        this.api.time(),
        this.api.audit(),
        this.api.bots(),
      ]);
      this.time.set(time);
      this.bots.set(bots);
      this.factor.set(time.factor);
      this.audit.set(audit);
    });
  }

  protected setFactor(): Promise<void> {
    return this.run(async () => {
      this.time.set(await this.api.setTime({ factor: this.factor() }));
      this.notice.set('admin.time.saved');
      this.audit.set(await this.api.audit());
    });
  }

  protected advance(ms: number): Promise<void> {
    return this.run(async () => {
      this.time.set(await this.api.setTime({ advanceMs: ms }));
      this.notice.set('admin.time.advanced');
      this.audit.set(await this.api.audit());
    });
  }

  protected setAgent(bot: AdminBotView, agent: string): Promise<void> {
    return this.run(async () =>
      this.bots.set(await this.api.setBotAgent(bot.accountId, agent || null)),
    );
  }

  protected runBots(): Promise<void> {
    return this.run(async () => {
      this.botRun.set(await this.api.runBots());
      this.bots.set(await this.api.bots());
    });
  }

  protected errorsText(errors: Record<string, number>): string {
    return Object.entries(errors)
      .map(([k, v]) => `${k} ×${v}`)
      .join(', ');
  }

  protected search(): Promise<void> {
    return this.run(async () => this.accounts.set(await this.api.accounts(this.query())));
  }

  protected form(id: string) {
    return this.forms()[id] ?? { amount: '', reason: '' };
  }

  protected patch(id: string, patch: Partial<{ amount: string; reason: string }>): void {
    this.forms.update((f) => ({ ...f, [id]: { ...this.form(id), ...patch } }));
  }

  protected act(
    account: AdminAccountView,
    action: 'ban' | 'unban' | 'xp' | 'credits',
  ): Promise<void> {
    const { amount, reason } = this.form(account.accountId);
    return this.run(async () => {
      if (action === 'ban') await this.api.ban(account.accountId, reason);
      if (action === 'unban') await this.api.ban(account.accountId, null);
      if (action === 'xp') await this.api.xp(account.accountId, Number(amount), reason);
      if (action === 'credits') await this.api.credits(account.accountId, Number(amount), reason);
      this.notice.set(`admin.done.${action}`);
      this.patch(account.accountId, { amount: '', reason: '' });
      const [accounts, audit] = await Promise.all([
        this.api.accounts(this.query()),
        this.api.audit(),
      ]);
      this.accounts.set(accounts);
      this.audit.set(audit);
    });
  }

  protected formatDate(iso: string): string {
    return new Date(iso).toLocaleString();
  }

  protected dataText(data: Record<string, unknown>): string {
    return Object.entries(data)
      .map(([k, v]) => `${k}: ${String(v)}`)
      .join(', ');
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
