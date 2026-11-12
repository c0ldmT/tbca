import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { Clock } from '@tbca/game-core';
import type {
  AdminJobResult,
  AdminSeasonResetResult,
  AdminSeasonView,
  DailyLimitKind,
  SeasonJobId,
} from '@tbca/shared';

import { BotAgentService } from '../bots/bot-agent.service.js';
import type { CharacterRepository } from '../character/types.js';
import { ApiError } from '../common/api-error.js';
import type { Env } from '../config/env.js';
import { DiscordService } from '../discord/discord.service.js';
import { DungeonService } from '../dungeon/dungeon.service.js';
import { dayKey } from '../fight/day.js';
import { LeagueService } from '../league/league.service.js';
import { SeasonService } from '../game/season.js';
import { ProgressionService } from '../progression/progression.service.js';
import {
  ADMIN_REPOSITORY,
  CHARACTER_REPOSITORY,
  CLOCK,
  ENV,
  SEASON_ADMIN_REPOSITORY,
} from '../tokens.js';
import type { AdminRepository, SeasonAdminRepository } from './types.js';

/**
 * Steuerung der laufenden Season (Spezifikation, Abschnitt 13): Kennzahlen des Tages,
 * Tageslimits zurücksetzen, Hintergrund-Jobs sofort auslösen, laufende Runs beenden, das
 * Season-Ende verschieben und die Season zurücksetzen. Jede Aktion landet im Audit-Log.
 */
@Injectable()
export class SeasonAdminService {
  constructor(
    @Inject(SEASON_ADMIN_REPOSITORY) private readonly repo: SeasonAdminRepository,
    @Inject(ADMIN_REPOSITORY) private readonly admin: AdminRepository,
    @Inject(CHARACTER_REPOSITORY) private readonly characters: CharacterRepository,
    @Inject(SeasonService) private readonly seasons: SeasonService,
    @Inject(ProgressionService) private readonly progression: ProgressionService,
    @Inject(DungeonService) private readonly dungeon: DungeonService,
    @Inject(DiscordService) private readonly discord: DiscordService,
    @Inject(BotAgentService) private readonly bots: BotAgentService,
    @Inject(LeagueService) private readonly league: LeagueService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async view(): Promise<AdminSeasonView> {
    const season = await this.seasons.current();
    const day = this.today();
    const [info, stats, resets, median] = await Promise.all([
      this.repo.info(season.id),
      this.repo.stats(season.id, day),
      this.repo.resetsOn(season.id, day),
      this.progression.median(season.id).catch(() => null),
    ]);
    return {
      season: {
        id: season.id,
        slug: info?.slug ?? '',
        name: season.name,
        isTest: season.isTest,
        startsAt: info?.startsAt.toISOString() ?? '',
        endsAt: info?.endsAt.toISOString() ?? '',
      },
      day,
      gameNow: new Date(this.clock.now()).toISOString(),
      medianLevel: median,
      stats,
      limits: {
        dungeonRunsPerDay: season.game.dungeon.runsPerDay,
        rewardedFightsPerDay: season.game.pvp.dailyRewardedFights,
      },
      resetsToday: resets.map((r) => ({
        kind: r.kind,
        characterName: r.characterName,
        at: r.createdAt.toISOString(),
      })),
    };
  }

  async resetDaily(
    actor: string,
    input: { kinds: DailyLimitKind[]; accountId: string | null; reason: string },
  ): Promise<AdminSeasonView> {
    const season = await this.seasons.current();
    let target: { accountId: string; characterId: string } | null = null;
    if (input.accountId) {
      const c = await this.characters.findForAccount(input.accountId, season.id);
      if (!c) {
        throw new ApiError(HttpStatus.NOT_FOUND, 'no_character', 'Kein Charakter in dieser Season');
      }
      target = { accountId: input.accountId, characterId: c.id };
    }
    const kinds = [...new Set(input.kinds)];
    const day = this.today();
    await this.repo.resetDaily({ seasonId: season.id, day, kinds, account: target });
    await this.admin.audit({
      actorAccountId: actor,
      action: 'season.daily_reset',
      targetType: target ? 'character' : 'season',
      targetId: target?.characterId ?? season.id,
      data: { kinds, day, reason: input.reason },
    });
    return this.view();
  }

  async runJob(actor: string, job: SeasonJobId): Promise<AdminJobResult> {
    const season = await this.seasons.current();
    const started = Date.now();
    let result: Record<string, unknown>;
    switch (job) {
      case 'season-stats':
        result = { medianLevel: await this.progression.refreshMedian(season.id) };
        break;
      case 'flush-passive-xp':
        result = { ...(await this.discord.flushPassive()) };
        break;
      case 'expire-dungeon-runs':
        result = { expired: await this.dungeon.expireIdleRuns() };
        break;
      case 'end-dungeon-runs':
        result = { ended: await this.dungeon.endActiveRuns() };
        break;
      case 'bot-agents':
        result = { ...(await this.bots.runAll()) };
        break;
      case 'league-tick':
        result = { ...(await this.league.tick()) };
        break;
    }
    await this.admin.audit({
      actorAccountId: actor,
      action: `season.job.${job}`,
      targetType: 'season',
      targetId: season.id,
      data: result,
    });
    return { job, ms: Date.now() - started, result };
  }

  async setEnd(actor: string, endsAt: Date): Promise<AdminSeasonView> {
    const season = await this.seasons.current();
    const info = await this.repo.info(season.id);
    if (info && endsAt <= info.startsAt) {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'season_end_before_start', 'Ende vor dem Start');
    }
    await this.repo.setEnd(season.id, endsAt);
    await this.admin.audit({
      actorAccountId: actor,
      action: 'season.end',
      targetType: 'season',
      targetId: season.id,
      data: { before: info?.endsAt.toISOString() ?? null, after: endsAt.toISOString() },
    });
    return this.view();
  }

  /**
   * Setzt die Season zurück. Zur Bestätigung muss der Slug der laufenden Season mitkommen –
   * so löscht kein versehentlicher Klick oder veralteter Tab eine andere Season.
   */
  async reset(
    actor: string,
    input: { mode: 'progress' | 'wipe'; confirm: string; reason: string },
  ): Promise<AdminSeasonResetResult> {
    const season = await this.seasons.current();
    const info = await this.repo.info(season.id);
    if (!info || input.confirm.trim() !== info.slug) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        'confirm_mismatch',
        'Bestätigung passt nicht zur laufenden Season',
      );
    }
    const counts = await this.repo.resetSeason(season.id, input.mode);
    await this.progression.refreshMedian(season.id).catch(() => undefined);
    await this.admin.audit({
      actorAccountId: actor,
      action: `season.reset.${input.mode}`,
      targetType: 'season',
      targetId: season.id,
      data: { ...counts, reason: input.reason, isTest: season.isTest },
    });
    return { mode: input.mode, ...counts };
  }

  private today(): string {
    return dayKey(this.clock.now(), this.env.GAME_TIMEZONE);
  }
}
