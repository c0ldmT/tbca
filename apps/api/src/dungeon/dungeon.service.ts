import { randomUUID } from 'node:crypto';

import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { InsufficientCreditsError, InsufficientMaterialsError } from '@tbca/db';
import {
  dungeonFee,
  ENGINE_VERSION,
  floorReward,
  levelFromXp,
  planFloor,
  regenerate,
  roundDiv,
  simulateBattle,
  type Clock,
} from '@tbca/game-core';
import type { DungeonRunView, DungeonStartRequest, DungeonView } from '@tbca/shared';

import { snapshotOf } from '../character/character.service.js';
import type { CharacterRecord, CharacterRepository } from '../character/types.js';
import { ApiError } from '../common/api-error.js';
import type { Env } from '../config/env.js';
import type { EconomyRepository } from '../economy/types.js';
import { dayKey } from '../fight/day.js';
import { SeasonService, type CurrentSeason } from '../game/season.js';
import { ProgressionService } from '../progression/progression.service.js';
import {
  CHARACTER_REPOSITORY,
  CLOCK,
  DUNGEON_REPOSITORY,
  ECONOMY_REPOSITORY,
  ENV,
} from '../tokens.js';
import type { DungeonRepository, DungeonRun, DungeonTx } from './types.js';

/**
 * Dungeon (Spezifikation, Abschnitt 8): endlose Etagen, nach jedem Sieg weiter oder raus.
 * Eine Niederlage kostet den Run-Loot, außer ein Backup-Chip rettet ihn. HP und Energie bleiben
 * zwischen den Etagen erhalten (+10 %), Heil-Injektoren helfen dazwischen. XP gibt es sofort,
 * Items und Credits erst beim Verlassen.
 */
@Injectable()
export class DungeonService {
  constructor(
    @Inject(DUNGEON_REPOSITORY) private readonly runs: DungeonRepository,
    @Inject(ECONOMY_REPOSITORY) private readonly economy: EconomyRepository,
    @Inject(CHARACTER_REPOSITORY) private readonly characters: CharacterRepository,
    @Inject(SeasonService) private readonly seasons: SeasonService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ENV) private readonly env: Env,
    @Inject(ProgressionService) private readonly progression: ProgressionService,
  ) {}

  async status(accountId: string): Promise<DungeonView> {
    const { season, me } = await this.mine(accountId);
    await this.runs.locked(me.id, (tx) => this.expireIfIdle(tx, season, me));
    return this.view(season, me);
  }

  /**
   * Beendet alle Runs, die länger als die Entscheidungsfrist ohne Aktion sind (Worker-Job):
   * Der Charakter verlässt den Dungeon mit seinem Loot.
   * @returns Anzahl beendeter Runs
   */
  async expireIdleRuns(): Promise<number> {
    const season = await this.seasons.current();
    const cutoff = new Date(this.clock.now() - season.game.dungeon.decisionTimeoutMs);
    let expired = 0;
    for (const { characterId, accountId } of await this.runs.idleRuns(cutoff)) {
      const me = await this.characters.findForAccount(accountId, season.id);
      if (!me || me.id !== characterId) continue;
      await this.runs.locked(characterId, async (tx) => {
        const before = await tx.activeRun(characterId);
        await this.expireIfIdle(tx, season, me);
        if (before && !(await tx.activeRun(characterId))) expired++;
      });
    }
    return expired;
  }

  async start(accountId: string, req: DungeonStartRequest): Promise<DungeonView> {
    const { season, me } = await this.mine(accountId);
    const rules = season.game.dungeon;
    if (req.injectors > rules.maxInjectors) {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'too_many_injectors', 'Zu viele Heil-Injektoren');
    }
    await this.runs.locked(me.id, async (tx) => {
      await this.expireIfIdle(tx, season, me);
      if (await tx.activeRun(me.id)) {
        throw new ApiError(HttpStatus.CONFLICT, 'run_active', 'Es läuft bereits ein Run');
      }
      const day = this.today();
      if ((await tx.runsOnDay(me.id, day)) >= rules.runsPerDay) {
        throw new ApiError(HttpStatus.CONFLICT, 'no_runs_left', 'Keine Runs mehr für heute');
      }
      // Eintritt zahlen und Verbrauchsgüter in den Run mitnehmen.
      await this.book(tx, {
        seasonId: season.id,
        accountId,
        credits: {
          amount: -dungeonFee(rules, me.level),
          kind: 'dungeon_fee',
          system: 'sink:dungeon',
        },
        stacks: { heal_injector: -req.injectors, backup_chip: req.backupChip ? -1 : 0 },
      });
      const snapshot = snapshotOf(season, me);
      const run = await tx.saveRun({
        id: null,
        seasonId: season.id,
        accountId,
        characterId: me.id,
        status: 'active',
        floor: 0,
        seed: randomUUID(),
        snapshot,
        hp: snapshot.stats.maxHp,
        energy: snapshot.stats.energyStart,
        injectors: req.injectors,
        backupChip: req.backupChip,
        loot: { items: [], credits: 0 },
        xpGained: 0,
        lastFightId: null,
        rewardDay: day,
        lastActionAt: new Date(this.clock.now()),
        endedAt: null,
      });
      await this.fightNextFloor(tx, season, me, run);
    });
    return this.view(season, me);
  }

  async continue(accountId: string): Promise<DungeonView> {
    const { season, me } = await this.mine(accountId);
    await this.runs.locked(me.id, async (tx) => {
      const run = await this.requireActive(tx, season, me);
      await this.fightNextFloor(tx, season, me, run);
    });
    return this.view(season, await this.reload(accountId, season));
  }

  async heal(accountId: string): Promise<DungeonView> {
    const { season, me } = await this.mine(accountId);
    await this.runs.locked(me.id, async (tx) => {
      const run = await this.requireActive(tx, season, me);
      if (run.injectors === 0)
        throw new ApiError(HttpStatus.CONFLICT, 'no_injectors', 'Keine Heil-Injektoren');
      const max = run.snapshot.stats.maxHp;
      await tx.saveRun({
        ...run,
        injectors: run.injectors - 1,
        hp: Math.min(max, run.hp + roundDiv(max * season.game.dungeon.healPermille, 1000)),
        lastActionAt: new Date(this.clock.now()),
      });
    });
    return this.view(season, me);
  }

  async leave(accountId: string): Promise<DungeonView> {
    const { season, me } = await this.mine(accountId);
    await this.runs.locked(me.id, async (tx) => {
      const run = await this.requireActive(tx, season, me);
      await this.finish(tx, run, 'left');
    });
    return this.view(season, me);
  }

  // --- Ablauf ----------------------------------------------------------------

  private async fightNextFloor(
    tx: DungeonTx,
    season: CurrentSeason,
    me: CharacterRecord,
    run: DungeonRun,
  ) {
    const floor = run.floor + 1;
    const plan = planFloor(season.game, {
      characterLevel: run.snapshot.level,
      floor,
      seed: `${run.seed}:${floor}`,
    });
    const self = { ...run.snapshot, state: { hp: run.hp, energy: run.energy } };
    const seed = `${run.seed}:${floor}:fight`;
    const teams = [[self], [...plan.enemies]];
    const result = simulateBattle({
      engineVersion: ENGINE_VERSION,
      configVersion: season.configVersion,
      seed,
      rules: season.battle,
      teams,
    });
    const won = result.winner === 0;
    const median = await this.progression.median(season.id);
    const reward = won
      ? this.progression.boost(
          season.game,
          floorReward(season.game, { plan, seed: `${run.seed}:${floor}:loot` }),
          run.snapshot.level,
          median,
        )
      : null;

    const fightId = await tx.insertFight({
      seasonId: season.id,
      kind: 'dungeon',
      seed,
      configVersion: season.configVersion,
      input: { rules: season.battle, teams },
      result,
      rewardDay: run.rewardDay,
      participants: [
        {
          team: 0,
          slot: 0,
          characterId: me.id,
          initiator: true,
          won,
          rewarded: won,
          xpAwarded: reward?.xp ?? 0,
          creditsAwarded: 0,
          opponentCharacterId: null,
        },
        ...plan.enemies.map((_, i) => ({
          team: 1,
          slot: i,
          characterId: null,
          initiator: false,
          won: !won,
          rewarded: false,
          xpAwarded: 0,
          creditsAwarded: 0,
          opponentCharacterId: null,
        })),
      ],
    });

    if (!won || !reward) {
      // Niederlage: ohne Backup-Chip ist der Run-Loot verloren; der Chip wird dabei zerstört.
      await this.finish(
        tx,
        { ...run, lastFightId: fightId, hp: 0 },
        run.backupChip ? 'saved' : 'defeated',
      );
      return;
    }

    // XP sofort, Items und Credits als Run-Loot vorgemerkt.
    const fresh = (await this.characters.findById(me.id)) ?? me;
    const xp = fresh.xp + reward.xp;
    await tx.setProgress(me.id, xp, Math.max(fresh.level, levelFromXp(season.game, xp).level));
    const survivor = result.survivors.find((s) => s.id === run.snapshot.id)!;
    const next = regenerate(
      season.game.dungeon,
      { hp: survivor.hp, energy: survivor.energy },
      { hp: run.snapshot.stats.maxHp, energy: run.snapshot.stats.energyMax },
    );
    await tx.saveRun({
      ...run,
      floor,
      hp: next.hp,
      energy: next.energy,
      loot: {
        items: [...run.loot.items, ...reward.items],
        credits: run.loot.credits + reward.credits,
      },
      xpGained: run.xpGained + reward.xp,
      lastFightId: fightId,
      lastActionAt: new Date(this.clock.now()),
    });
  }

  /** Beendet einen Run: Loot auszahlen (außer bei Niederlage ohne Chip), Unverbrauchtes zurück. */
  private async finish(
    tx: DungeonTx,
    run: DungeonRun,
    status: Exclude<DungeonRun['status'], 'active'>,
  ) {
    const keepLoot = status !== 'defeated';
    const returnChip = run.backupChip && status !== 'saved' && status !== 'defeated';
    const payCredits = keepLoot && run.loot.credits > 0;
    await this.book(tx, {
      seasonId: run.seasonId,
      accountId: run.accountId,
      ...(payCredits
        ? {
            credits: {
              amount: run.loot.credits,
              kind: 'dungeon_loot',
              system: 'source:dungeon' as const,
              refId: run.id,
            },
          }
        : {}),
      stacks: { heal_injector: run.injectors, backup_chip: returnChip ? 1 : 0 },
      addItems: keepLoot ? run.loot.items.map((data) => ({ data, source: 'dungeon' })) : [],
    });
    await tx.saveRun({
      ...run,
      status,
      endedAt: new Date(this.clock.now()),
      lastActionAt: new Date(this.clock.now()),
    });
  }

  /** Nach 10 Minuten ohne Entscheidung verlässt der Charakter den Dungeon mit seinem Loot. */
  private async expireIfIdle(
    tx: DungeonTx,
    season: CurrentSeason,
    me: CharacterRecord,
  ): Promise<void> {
    const run = await tx.activeRun(me.id);
    if (
      run &&
      this.clock.now() - run.lastActionAt.getTime() > season.game.dungeon.decisionTimeoutMs
    ) {
      await this.finish(tx, run, 'timed_out');
    }
  }

  private async requireActive(
    tx: DungeonTx,
    season: CurrentSeason,
    me: CharacterRecord,
  ): Promise<DungeonRun> {
    await this.expireIfIdle(tx, season, me);
    const run = await tx.activeRun(me.id);
    if (!run) throw new ApiError(HttpStatus.CONFLICT, 'no_active_run', 'Kein laufender Run');
    return run;
  }

  private async book(tx: DungeonTx, change: Parameters<DungeonTx['economy']>[0]): Promise<void> {
    const cleaned = {
      ...change,
      stacks: Object.fromEntries(Object.entries(change.stacks ?? {}).filter(([, v]) => v !== 0)),
    };
    try {
      await tx.economy(cleaned);
    } catch (error) {
      if (error instanceof InsufficientCreditsError) {
        throw new ApiError(HttpStatus.CONFLICT, 'insufficient_credits', 'Nicht genug Credits');
      }
      if (error instanceof InsufficientMaterialsError) {
        throw new ApiError(HttpStatus.CONFLICT, 'insufficient_materials', 'Nicht genug Vorräte');
      }
      throw error;
    }
  }

  private async view(season: CurrentSeason, me: CharacterRecord): Promise<DungeonView> {
    const rules = season.game.dungeon;
    const day = this.today();
    const latest = await this.runs.latestRun(me.id);
    const runsToday = await this.runs.locked(me.id, (tx) => tx.runsOnDay(me.id, day));
    let run: DungeonRunView | null = null;
    if (latest && (latest.status === 'active' || latest.rewardDay === day)) {
      const nextPlan =
        latest.status === 'active'
          ? planFloor(season.game, {
              characterLevel: latest.snapshot.level,
              floor: latest.floor + 1,
              seed: `${latest.seed}:${latest.floor + 1}`,
            })
          : null;
      run = {
        id: latest.id!,
        status: latest.status,
        floor: latest.floor,
        hp: latest.hp,
        maxHp: latest.snapshot.stats.maxHp,
        energy: latest.energy,
        maxEnergy: latest.snapshot.stats.energyMax,
        injectors: latest.injectors,
        backupChip: latest.backupChip,
        // Während des Runs versiegelt: nur die Zahl der Funde, der Inhalt kommt beim Ausstieg
        loot:
          latest.status === 'active'
            ? { sealed: true, count: latest.loot.items.length, items: [], credits: 0 }
            : { sealed: false, count: latest.loot.items.length, ...latest.loot },
        xpGained: latest.xpGained,
        lastFightId: latest.lastFightId,
        next: nextPlan && {
          floor: nextPlan.floor,
          monsterLevel: nextPlan.monsterLevel,
          boss: nextPlan.boss,
          modifiers: [...nextPlan.modifiers],
        },
        decideBy:
          latest.status === 'active'
            ? new Date(latest.lastActionAt.getTime() + rules.decisionTimeoutMs).toISOString()
            : null,
      };
    }
    return {
      runsToday,
      runsPerDay: rules.runsPerDay,
      fee: dungeonFee(rules, me.level),
      stacks: await this.economy.stacks(me.accountId, season.id),
      maxInjectors: rules.maxInjectors,
      run,
    };
  }

  private today(): string {
    return dayKey(this.clock.now(), this.env.GAME_TIMEZONE);
  }

  private async reload(accountId: string, season: CurrentSeason): Promise<CharacterRecord> {
    return (await this.characters.findForAccount(accountId, season.id))!;
  }

  private async mine(accountId: string): Promise<{ season: CurrentSeason; me: CharacterRecord }> {
    const season = await this.seasons.current();
    const me = await this.characters.findForAccount(accountId, season.id);
    if (!me)
      throw new ApiError(
        HttpStatus.NOT_FOUND,
        'no_character',
        'Noch kein Charakter in dieser Season',
      );
    return { season, me };
  }
}
