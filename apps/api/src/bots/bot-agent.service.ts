import { randomUUID } from 'node:crypto';

import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { BOT_AGENTS, type BotAgent } from '@tbca/db';
import { CLASS_IDS, Xoshiro128ss } from '@tbca/game-core';
import type { AdminBotView, BotRunResult } from '@tbca/shared';

import { CharacterService } from '../character/character.service.js';
import { ApiError } from '../common/api-error.js';
import { DungeonService } from '../dungeon/dungeon.service.js';
import { FightService } from '../fight/fight.service.js';
import { SeasonService } from '../game/season.js';
import type { LeagueRepository } from '../league/types.js';
import { ADMIN_REPOSITORY, BOT_REPOSITORY, LEAGUE_REPOSITORY } from '../tokens.js';
import type { AdminRepository } from '../admin/types.js';
import type { BotInfo, BotRepository } from './bot.repository.js';

/**
 * Bot-Spieler mit Agententypen (Spezifikation, Abschnitt 14). Sie spielen über dieselben Services
 * wie echte Spieler – mit allen Regeln, Limits und Buchungen – und machen Test-Seasons lebendig.
 * Nur in Test-Seasons aktiv; der Worker stößt sie regelmäßig an.
 *
 * - casual: ab und zu ein gewerteter Kampf
 * - active: mehrere Kämpfe und ein kurzer Dungeon-Run
 * - farmer: Dungeon-Runs bis Etage 3
 * - climber: Dungeon-Runs, so tief es die HP erlauben
 * - class_switcher: wechselt die Klasse und kämpft
 *
 * Alle Bots mit Agent melden sich für die Liga an; eingeteilt werden sie wie Spieler erst nach
 * ihren Platzierungskämpfen (gewertete Kämpfe in beide Richtungen zählen).
 */
@Injectable()
export class BotAgentService {
  constructor(
    @Inject(BOT_REPOSITORY) private readonly bots: BotRepository,
    @Inject(ADMIN_REPOSITORY) private readonly admin: AdminRepository,
    @Inject(FightService) private readonly fights: FightService,
    @Inject(DungeonService) private readonly dungeon: DungeonService,
    @Inject(CharacterService) private readonly characters: CharacterService,
    @Inject(SeasonService) private readonly seasons: SeasonService,
    @Inject(LEAGUE_REPOSITORY) private readonly league: LeagueRepository,
  ) {}

  async list(): Promise<AdminBotView[]> {
    const season = await this.seasons.current();
    return this.bots.list(season.id);
  }

  async setAgent(
    actor: string,
    accountId: string,
    agent: BotAgent | null,
  ): Promise<AdminBotView[]> {
    if (!(await this.bots.setAgent(accountId, agent))) {
      throw new ApiError(HttpStatus.NOT_FOUND, 'bot_not_found', 'Bot nicht gefunden');
    }
    await this.admin.audit({
      actorAccountId: actor,
      action: 'bot.agent',
      targetType: 'account',
      targetId: accountId,
      data: { agent },
    });
    return this.list();
  }

  /** Lässt alle Bots mit Agententyp einmal handeln. */
  async runAll(): Promise<BotRunResult> {
    const season = await this.seasons.current();
    if (!season.isTest) return { acted: 0, actions: 0, errors: {}, skipped: 'real_season' };
    const rng = Xoshiro128ss.fromSeed(randomUUID());
    const result: BotRunResult = { acted: 0, actions: 0, errors: {}, skipped: null };
    for (const bot of await this.bots.list(season.id)) {
      if (!bot.agent || !bot.character) continue;
      try {
        // Bots mit Agent spielen in Test-Seasons auch in der Liga mit (nach ihrer Platzierung)
        await this.league.setJoined(season.id, bot.character.id, true);
        try {
          result.actions += await this.act(bot, bot.agent, rng);
        } finally {
          // Auch nach einem Fehler: gewonnene Level nicht ungenutzt lassen.
          await this.spendPoints(bot.accountId).catch(() => undefined);
        }
        result.acted++;
      } catch (error) {
        const code =
          error instanceof ApiError
            ? String((error.getResponse() as { code?: string }).code)
            : 'error';
        result.errors[code] = (result.errors[code] ?? 0) + 1;
      }
    }
    return result;
  }

  private async act(bot: BotInfo, agent: BotAgent, rng: Xoshiro128ss): Promise<number> {
    switch (agent) {
      case 'casual':
        return rng.chance(500, 1000) ? this.pvp(bot, 1, rng) : 0;
      case 'active':
        return (await this.pvp(bot, 3, rng)) + (await this.dive(bot, { maxFloors: 3 }));
      case 'farmer':
        return this.dive(bot, { maxFloors: 3 });
      case 'climber':
        return this.dive(bot, { minHpPermille: 400 });
      case 'class_switcher': {
        const others = CLASS_IDS.filter((c) => c !== bot.character!.classId);
        await this.characters.switchClass(bot.accountId, others[rng.nextInt(others.length)]!);
        return 1 + (await this.pvp(bot, 2, rng));
      }
    }
  }

  /** Gewertete Kämpfe; bevorzugt Gegner, die noch eine Belohnung bringen. */
  private async pvp(bot: BotInfo, count: number, rng: Xoshiro128ss): Promise<number> {
    let done = 0;
    for (let i = 0; i < count; i++) {
      const list = await this.fights.opponents(bot.accountId, '');
      const rewarding = list.filter((o) => o.winXp > 0);
      const pool = rewarding.length > 0 ? rewarding : list;
      if (pool.length === 0) break;
      await this.fights.challenge(bot.accountId, {
        opponentId: pool[rng.nextInt(pool.length)]!.id,
        mode: 'rated',
      });
      done++;
    }
    return done;
  }

  /** Dungeon-Run: weiter, solange Etagenzahl bzw. HP es zulassen, dann mit Loot raus. */
  private async dive(
    bot: BotInfo,
    limits: { maxFloors?: number; minHpPermille?: number },
  ): Promise<number> {
    let view = await this.dungeon.status(bot.accountId);
    if (view.run?.status !== 'active') {
      if (view.runsToday >= view.runsPerDay) return 0;
      try {
        view = await this.dungeon.start(bot.accountId, { injectors: 0, backupChip: false });
      } catch (error) {
        // Ohne Credits für den Eintritt wartet der Bot einfach auf die nächste Runde.
        if (
          error instanceof ApiError &&
          (error.getResponse() as { code?: string }).code === 'insufficient_credits'
        )
          return 0;
        throw error;
      }
    }
    let actions = 1;
    while (view.run?.status === 'active') {
      const r = view.run;
      const deepEnough = limits.maxFloors !== undefined && r.floor >= limits.maxFloors;
      const tooHurt =
        limits.minHpPermille !== undefined && r.hp * 1000 < r.maxHp * limits.minHpPermille;
      if (deepEnough || tooHurt || r.floor >= 50) {
        await this.dungeon.leave(bot.accountId);
        break;
      }
      view = await this.dungeon.continue(bot.accountId);
      actions++;
    }
    return actions;
  }

  /** Freie Punkte wie ein typischer Spieler verteilen: 60 % Hauptattribut, Rest Konstitution. */
  private async spendPoints(accountId: string): Promise<void> {
    const c = await this.characters.get(accountId);
    if (c.unspentPoints <= 0) return;
    const season = await this.seasons.current();
    const primary = season.game.classes[c.classId].primary;
    const toPrimary = Math.ceil(c.unspentPoints * 0.6);
    const allocated = { ...c.allocated };
    allocated[primary] += toPrimary;
    allocated.con += c.unspentPoints - toPrimary;
    await this.characters.setAttributes(accountId, allocated);
  }

  static readonly agents = BOT_AGENTS;
}
