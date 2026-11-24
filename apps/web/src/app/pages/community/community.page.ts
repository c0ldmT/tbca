import { Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import type { CommunityMemberView, CommunityView } from '@tbca/shared';

import { AccountService } from '../../core/account.service';
import { ApiFailure } from '../../core/api-failure';
import { AuthService } from '../../core/auth.service';
import { TeamService } from '../../core/team.service';

/** Community verwalten: Rollen (Admins) und XP-Korrekturen (Moderatoren). */
@Component({
  selector: 'tbca-community-page',
  imports: [TranslocoDirective, RouterLink],
  templateUrl: './community.page.html',
  styleUrl: '../admin/admin.page.css',
})
export class CommunityPage {
  readonly id = input.required<string>();

  protected readonly auth = inject(AuthService);
  private readonly accounts = inject(AccountService);
  private readonly teams = inject(TeamService);

  protected readonly roles = ['member', 'moderator', 'admin'] as const;
  protected readonly community = signal<CommunityView | null>(null);
  protected readonly members = signal<CommunityMemberView[]>([]);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly forms = signal<Record<string, { amount: string; reason: string }>>({});
  protected readonly isAdmin = computed(() => this.community()?.role === 'admin');

  constructor() {
    queueMicrotask(() => void this.load());
  }

  protected async load(): Promise<void> {
    await this.run(async () => {
      if (this.auth.state() === undefined) await this.auth.refresh();
      this.community.set((await this.teams.communities()).find((c) => c.id === this.id()) ?? null);
      this.members.set(await this.accounts.members(this.id()));
    });
  }

  protected form(id: string) {
    return this.forms()[id] ?? { amount: '', reason: '' };
  }

  protected patch(id: string, patch: Partial<{ amount: string; reason: string }>): void {
    this.forms.update((f) => ({ ...f, [id]: { ...this.form(id), ...patch } }));
  }

  protected setRole(m: CommunityMemberView, role: string): Promise<void> {
    return this.run(async () => {
      this.members.set(await this.accounts.setRole(this.id(), m.accountId, role));
      this.notice.set('community.roleSaved');
    });
  }

  protected correct(m: CommunityMemberView): Promise<void> {
    const { amount, reason } = this.form(m.accountId);
    return this.run(async () => {
      this.members.set(
        await this.accounts.correctXp(this.id(), m.accountId, Number(amount), reason),
      );
      this.patch(m.accountId, { amount: '', reason: '' });
      this.notice.set('community.xpSaved');
    });
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
