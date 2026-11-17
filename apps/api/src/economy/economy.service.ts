import { randomUUID } from 'node:crypto';

import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { InsufficientCreditsError, InsufficientMaterialsError } from '@tbca/db';
import {
  CONSUMABLES,
  CraftingError,
  itemValue,
  rerollAffix,
  rerollCost,
  rollLoot,
  salvageYield,
  transferAffix,
  transferCost,
  upgradeCost,
  upgradeItem,
  Xoshiro128ss,
  type Clock,
  type ConsumableId,
  type ItemData,
  type ItemStat,
  type MaterialCost,
} from '@tbca/game-core';
import type { CraftingResult, ShopView } from '@tbca/shared';

import type { CharacterRecord, CharacterRepository } from '../character/types.js';
import { ApiError } from '../common/api-error.js';
import type { Env } from '../config/env.js';
import { dayKey } from '../fight/day.js';
import { SeasonService, type CurrentSeason } from '../game/season.js';
import type { InventoryRepository, StoredItem } from '../inventory/types.js';
import {
  CHARACTER_REPOSITORY,
  CLOCK,
  ECONOMY_REPOSITORY,
  ENV,
  INVENTORY_REPOSITORY,
} from '../tokens.js';
import {
  AlreadyPurchasedError,
  ItemEquippedError,
  type EconomyChange,
  type EconomyRepository,
} from './types.js';

const negate = (cost: MaterialCost) =>
  Object.fromEntries(Object.entries(cost).map(([k, v]) => [k, -(v ?? 0)]));

/**
 * Crafting (Zerlegen, Aufwerten, Affix-Übertragung, Neu würfeln) und Shop (Verbrauchsgüter,
 * tägliche Rotation, Verkauf). Jede Aktion bucht Credits, Materialien und Items gemeinsam –
 * entweder alles oder nichts.
 */
@Injectable()
export class EconomyService {
  constructor(
    @Inject(ECONOMY_REPOSITORY) private readonly economy: EconomyRepository,
    @Inject(INVENTORY_REPOSITORY) private readonly items: InventoryRepository,
    @Inject(CHARACTER_REPOSITORY) private readonly characters: CharacterRepository,
    @Inject(SeasonService) private readonly seasons: SeasonService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ENV) private readonly env: Env,
  ) {}

  // --- Crafting --------------------------------------------------------------

  async salvage(accountId: string, itemId: string): Promise<CraftingResult> {
    const { season, me, item } = await this.withItem(accountId, itemId);
    const gained = salvageYield(season.game, item.data);
    await this.commit({
      seasonId: season.id,
      accountId,
      deleteItems: [itemId],
      stacks: gained as Record<string, number>,
    });
    return this.result(season, me, null, true, gained);
  }

  async upgrade(accountId: string, itemId: string): Promise<CraftingResult> {
    const { season, me, item } = await this.withItem(accountId, itemId);
    const cost = this.guard(() => upgradeCost(season.game, item.data));
    const outcome = upgradeItem(season.game, item.data, this.rng());
    await this.commit({
      seasonId: season.id,
      accountId,
      credits: { amount: -cost.credits, kind: 'upgrade', system: 'sink:crafting', refId: itemId },
      stacks: negate(cost.materials),
      updateItems: [{ id: itemId, data: outcome.item }],
    });
    return this.result(season, me, { ...item, data: outcome.item }, outcome.success);
  }

  async transfer(
    accountId: string,
    targetId: string,
    donorId: string,
    stat: ItemStat,
  ): Promise<CraftingResult> {
    if (targetId === donorId)
      throw new ApiError(HttpStatus.BAD_REQUEST, 'same_item', 'Ziel und Spender sind gleich');
    const { season, me, item: target } = await this.withItem(accountId, targetId);
    const donor = (await this.items.listItems(accountId, season.id)).find((i) => i.id === donorId);
    if (!donor) throw new ApiError(HttpStatus.NOT_FOUND, 'item_not_found', 'Item nicht gefunden');
    const cost = transferCost(season.game, target.data);
    const outcome = this.guard(() =>
      transferAffix(season.game, target.data, donor.data, stat, this.rng()),
    );
    await this.commit({
      seasonId: season.id,
      accountId,
      credits: {
        amount: -cost.credits,
        kind: 'affix_transfer',
        system: 'sink:crafting',
        refId: targetId,
      },
      deleteItems: [donorId],
      updateItems: outcome.success ? [{ id: targetId, data: outcome.item }] : [],
    });
    return this.result(season, me, { ...target, data: outcome.item }, outcome.success);
  }

  async reroll(accountId: string, itemId: string, stat: ItemStat): Promise<CraftingResult> {
    const { season, me, item } = await this.withItem(accountId, itemId);
    const cost = rerollCost(season.game, item.data);
    const next = this.guard(() => rerollAffix(season.game, item.data, stat, this.rng()));
    await this.commit({
      seasonId: season.id,
      accountId,
      credits: {
        amount: -cost.credits,
        kind: 'affix_reroll',
        system: 'sink:crafting',
        refId: itemId,
      },
      stacks: negate(cost.materials),
      updateItems: [{ id: itemId, data: next }],
    });
    return this.result(season, me, { ...item, data: next }, true);
  }

  // --- Shop ----------------------------------------------------------------

  async shop(accountId: string): Promise<ShopView> {
    const { season, me } = await this.mine(accountId);
    const day = this.today();
    const sold = new Set(await this.economy.purchases(accountId, season.id, day));
    return {
      day,
      credits: await this.characters.balance(accountId, season.id),
      stacks: await this.economy.stacks(accountId, season.id),
      consumables: season.game.shop.consumables.map((c) => ({
        offerId: c.id,
        consumable: c.id,
        price: c.price,
      })),
      rotation: this.rotation(season, me, day).map((o) => ({ ...o, sold: sold.has(o.offerId) })),
      sellPermille: season.game.shop.sellPermille,
    };
  }

  async buy(accountId: string, offerId: string): Promise<ShopView> {
    const { season, me } = await this.mine(accountId);
    const consumable = season.game.shop.consumables.find((c) => c.id === offerId);
    if (consumable && (CONSUMABLES as readonly string[]).includes(offerId)) {
      await this.commit({
        seasonId: season.id,
        accountId,
        credits: { amount: -consumable.price, kind: 'shop_purchase', system: 'sink:shop' },
        stacks: { [offerId as ConsumableId]: 1 },
      });
      return this.shop(accountId);
    }
    const day = this.today();
    const offer = this.rotation(season, me, day).find((o) => o.offerId === offerId);
    if (!offer)
      throw new ApiError(HttpStatus.NOT_FOUND, 'offer_not_found', 'Angebot nicht gefunden');
    await this.commit({
      seasonId: season.id,
      accountId,
      credits: { amount: -offer.price, kind: 'shop_purchase', system: 'sink:shop' },
      addItems: [{ data: offer.item, source: 'shop' }],
      purchase: { day, offerId },
    });
    return this.shop(accountId);
  }

  /** Verkauf an den Shop für 20 % des Werts (laut Konfiguration). */
  async sell(accountId: string, itemId: string): Promise<ShopView> {
    const { season, item } = await this.withItem(accountId, itemId);
    const price = Math.floor(
      (itemValue(season.game, item.data) * season.game.shop.sellPermille) / 1000,
    );
    await this.commit({
      seasonId: season.id,
      accountId,
      deleteItems: [itemId],
      credits: { amount: price, kind: 'shop_sale', system: 'source:shop', refId: itemId },
    });
    return this.shop(accountId);
  }

  // --- intern --------------------------------------------------------------------

  /** Tägliche Rotation je Spieler: gleicher Tag, gleiche Angebote. */
  private rotation(season: CurrentSeason, me: CharacterRecord, day: string) {
    const rules = season.game.shop;
    return Array.from({ length: rules.rotationSize }, (_, i) => {
      const item: ItemData = rollLoot(season.game, {
        itemLevel: me.level,
        maxRarity: rules.rotationMaxRarity,
        seed: `${season.id}:${me.accountId}:${day}:${i}`,
      });
      return { offerId: `rotation-${i}`, item, price: itemValue(season.game, item) };
    });
  }

  private async commit(change: EconomyChange): Promise<void> {
    try {
      await this.economy.commit(change);
    } catch (error) {
      if (error instanceof InsufficientCreditsError) {
        throw new ApiError(HttpStatus.CONFLICT, 'insufficient_credits', 'Nicht genug Credits');
      }
      if (error instanceof InsufficientMaterialsError) {
        throw new ApiError(HttpStatus.CONFLICT, 'insufficient_materials', 'Nicht genug Material');
      }
      if (error instanceof ItemEquippedError) {
        throw new ApiError(HttpStatus.CONFLICT, 'item_equipped', 'Ausgerüstete Items erst ablegen');
      }
      if (error instanceof AlreadyPurchasedError) {
        throw new ApiError(HttpStatus.CONFLICT, 'already_purchased', 'Heute schon gekauft');
      }
      throw error;
    }
  }

  private guard<T>(fn: () => T): T {
    try {
      return fn();
    } catch (error) {
      if (error instanceof CraftingError)
        throw new ApiError(HttpStatus.BAD_REQUEST, error.code, error.message);
      throw error;
    }
  }

  private rng(): Xoshiro128ss {
    return Xoshiro128ss.fromSeed(randomUUID());
  }

  private today(): string {
    return dayKey(this.clock.now(), this.env.GAME_TIMEZONE);
  }

  private async result(
    season: CurrentSeason,
    me: CharacterRecord,
    item: StoredItem | null,
    success: boolean,
    gained: MaterialCost = {},
  ): Promise<CraftingResult> {
    return {
      success,
      gained: gained as Record<string, number>,
      item: item
        ? {
            ...item.data,
            id: item.id,
            source: item.source,
            createdAt: item.createdAt.toISOString(),
            equippedIn: null,
          }
        : null,
      stacks: await this.economy.stacks(me.accountId, season.id),
      credits: await this.characters.balance(me.accountId, season.id),
    };
  }

  private async withItem(accountId: string, itemId: string) {
    const { season, me } = await this.mine(accountId);
    const item = (await this.items.listItems(accountId, season.id)).find((i) => i.id === itemId);
    if (!item) throw new ApiError(HttpStatus.NOT_FOUND, 'item_not_found', 'Item nicht gefunden');
    return { season, me, item };
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
