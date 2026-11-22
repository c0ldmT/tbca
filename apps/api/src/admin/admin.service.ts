import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { levelFromXp, type Clock } from '@tbca/game-core';
import type { AdminAccountView, AdminAuditView, AdminTimeView } from '@tbca/shared';

import type { CharacterRepository } from '../character/types.js';
import { ApiError } from '../common/api-error.js';
import type { EconomyRepository } from '../economy/types.js';
import { SeasonService, type SeasonRepository } from '../game/season.js';
import {
  ADMIN_REPOSITORY,
  CHARACTER_REPOSITORY,
  CLOCK,
  ECONOMY_REPOSITORY,
  SEASON_REPOSITORY,
} from '../tokens.js';
import type { AdminRepository } from './types.js';

/**
 * Admin-Bereich (Spezifikation, Abschnitte 13 und 14): Zeitsteuerung für Test-Seasons,
 * Spieler sperren, XP und Credits korrigieren. Jede Aktion landet im Audit-Log.
 */
@Injectable()
export class AdminService {
  constructor(
    @Inject(ADMIN_REPOSITORY) private readonly admin: AdminRepository,
    @Inject(SEASON_REPOSITORY) private readonly seasonRepo: SeasonRepository,
    @Inject(CHARACTER_REPOSITORY) private readonly characters: CharacterRepository,
    @Inject(ECONOMY_REPOSITORY) private readonly economy: EconomyRepository,
    @Inject(SeasonService) private readonly seasons: SeasonService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async time(): Promise<AdminTimeView> {
    const season = await this.seasons.current();
    return {
      season: { id: season.id, name: season.name, isTest: season.isTest },
      realNow: new Date().toISOString(),
      gameNow: new Date(this.clock.now()).toISOString(),
      factor: season.clock.factor,
    };
  }

  /** Zeitfaktor setzen und/oder vorspulen – nur in Test-Seasons. */
  async setTime(
    actor: string,
    input: { factor?: number | undefined; advanceMs?: number | undefined },
  ): Promise<AdminTimeView> {
    const season = await this.seasons.current();
    if (!season.isTest) {
      throw new ApiError(
        HttpStatus.FORBIDDEN,
        'test_season_only',
        'Zeitsteuerung nur in Test-Seasons',
      );
    }
    const factor = input.factor ?? season.clock.factor;
    const anchorGame = new Date(this.clock.now() + (input.advanceMs ?? 0));
    await this.seasonRepo.setClock(season.id, { factor, anchorReal: new Date(), anchorGame });
    await (this.clock as Partial<{ refresh: () => Promise<void> }>).refresh?.();
    await this.admin.audit({
      actorAccountId: actor,
      action: input.advanceMs ? 'time.advance' : 'time.factor',
      targetType: 'season',
      targetId: season.id,
      data: { factor, advanceMs: input.advanceMs ?? 0, gameNow: anchorGame.toISOString() },
    });
    return { ...(await this.time()), factor, gameNow: anchorGame.toISOString() };
  }

  async searchAccounts(query: string): Promise<AdminAccountView[]> {
    const season = await this.seasons.current();
    const list = await this.admin.searchAccounts(season.id, query.trim().slice(0, 40), 25);
    return list.map((a) => ({ ...a, bannedAt: a.bannedAt?.toISOString() ?? null }));
  }

  async ban(actor: string, accountId: string, reason: string | null): Promise<void> {
    if (actor === accountId)
      throw new ApiError(HttpStatus.BAD_REQUEST, 'self_ban', 'Nicht dich selbst sperren');
    if (!(await this.admin.setBan(accountId, reason))) {
      throw new ApiError(HttpStatus.NOT_FOUND, 'account_not_found', 'Account nicht gefunden');
    }
    if (reason !== null) await this.admin.revokeSessions(accountId);
    await this.admin.audit({
      actorAccountId: actor,
      action: reason === null ? 'account.unban' : 'account.ban',
      targetType: 'account',
      targetId: accountId,
      data: reason === null ? {} : { reason },
    });
  }

  /** XP-Korrektur (z. B. nach Missbrauch); das Level folgt der XP-Kurve, nie unter 1. */
  async adjustXp(actor: string, accountId: string, amount: number, reason: string) {
    const season = await this.seasons.current();
    const c = await this.characters.findForAccount(accountId, season.id);
    if (!c)
      throw new ApiError(HttpStatus.NOT_FOUND, 'no_character', 'Kein Charakter in dieser Season');
    const xp = Math.max(0, c.xp + amount);
    const level = levelFromXp(season.game, xp).level;
    await this.admin.setProgress(c.id, xp, level);
    await this.admin.audit({
      actorAccountId: actor,
      action: 'character.xp',
      targetType: 'character',
      targetId: c.id,
      data: {
        amount,
        reason,
        xpBefore: c.xp,
        xpAfter: xp,
        levelBefore: c.level,
        levelAfter: level,
      },
    });
    return { xp, level };
  }

  async adjustCredits(actor: string, accountId: string, amount: number, reason: string) {
    const season = await this.seasons.current();
    try {
      await this.economy.commit({
        seasonId: season.id,
        accountId,
        credits: {
          amount,
          kind: 'admin_correction',
          system: amount >= 0 ? 'source:admin' : 'sink:admin',
        },
      });
    } catch {
      throw new ApiError(
        HttpStatus.CONFLICT,
        'insufficient_credits',
        'Nicht genug Credits für den Abzug',
      );
    }
    await this.admin.audit({
      actorAccountId: actor,
      action: 'account.credits',
      targetType: 'account',
      targetId: accountId,
      data: { amount, reason },
    });
  }

  async auditLog(): Promise<AdminAuditView[]> {
    return (await this.admin.auditLog(100)).map((e) => ({
      ...e,
      createdAt: e.createdAt.toISOString(),
    }));
  }
}
