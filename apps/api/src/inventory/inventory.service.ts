import { randomUUID } from 'node:crypto';

import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  ItemError,
  rollItem,
  rollLoot,
  slotsFor,
  validateEquipment,
  type ClassId,
  type Equipment,
  type EquipSlot,
} from '@tbca/game-core';
import type { InventoryView, ItemView } from '@tbca/shared';

import type { CharacterRecord, CharacterRepository } from '../character/types.js';
import { ApiError } from '../common/api-error.js';
import { SeasonService, type CurrentSeason } from '../game/season.js';
import { CHARACTER_REPOSITORY, ECONOMY_REPOSITORY, INVENTORY_REPOSITORY } from '../tokens.js';
import type { EconomyRepository } from '../economy/types.js';
import type { InventoryRepository } from './types.js';

/** Startausrüstung: klassentypische Waffe und Weste, Stern 1, Item-Level 1. */
const STARTER_WEAPON: Record<ClassId, string> = {
  bruiser: 'blade',
  gunner: 'pistol',
  netrunner: 'cyberdeck',
  medtech: 'injector',
};

/** Test-Beute bis höchstens Stern 12, damit sich auch seltene Items ausprobieren lassen. */
const TEST_LOOT_MAX_RARITY = 12;

@Injectable()
export class InventoryService {
  constructor(
    @Inject(INVENTORY_REPOSITORY) private readonly items: InventoryRepository,
    @Inject(CHARACTER_REPOSITORY) private readonly characters: CharacterRepository,
    @Inject(SeasonService) private readonly seasons: SeasonService,
    @Inject(ECONOMY_REPOSITORY) private readonly economy: EconomyRepository,
  ) {}

  /** Gibt neuen (oder älteren, noch leeren) Charakteren ihre Startausrüstung und legt sie an. */
  /** @returns true, wenn die Startausrüstung gerade vergeben wurde. */
  async ensureStarterKit(season: CurrentSeason, record: CharacterRecord): Promise<boolean> {
    if ((await this.items.countItems(record.accountId, season.id)) > 0) return false;
    const templates = [STARTER_WEAPON[record.classId], 'vest'];
    // Startausrüstung ist für alle gleich: Stern 1 ohne Affixe.
    const data = templates.map((templateId) => ({
      ...rollItem(season.game, {
        templateId,
        itemLevel: 1,
        rarity: 1,
        seed: `starter:${templateId}`,
      }),
      affixes: [],
    }));
    const [weapon, vest] = await this.items.addItems(
      record.accountId,
      season.id,
      data.map((d) => ({ data: d, source: 'starter' })),
    );
    await this.items.setEquipment(record.id, { main_hand: weapon!, torso: vest! });
    return true;
  }

  async get(accountId: string): Promise<InventoryView> {
    const { season, me } = await this.mine(accountId);
    await this.ensureStarterKit(season, me);
    return this.view(season, me);
  }

  async equip(accountId: string, slot: EquipSlot, itemId: string): Promise<InventoryView> {
    const { season, me } = await this.mine(accountId);
    const owned = await this.items.listItems(accountId, season.id);
    const item = owned.find((i) => i.id === itemId);
    if (!item) throw new ApiError(HttpStatus.NOT_FOUND, 'item_not_found', 'Item nicht gefunden');

    const current = await this.items.equipmentOf(me.id);
    const changes: Partial<Record<EquipSlot, string | null>> = { [slot]: itemId };
    // Steckte das Item schon woanders, wird jener Platz frei.
    for (const [s, id] of Object.entries(current) as [EquipSlot, string][]) {
      if (id === itemId && s !== slot) changes[s] = null;
    }
    // Ein Zweihänder in der Haupthand macht die Nebenhand frei.
    if (slot === 'main_hand' && item.data.category === 'weapon_2h') changes.off_hand = null;

    const next: Record<string, string> = { ...current };
    for (const [s, id] of Object.entries(changes)) {
      if (id) next[s] = id;
      else delete next[s];
    }
    const byId = new Map(owned.map((i) => [i.id, i.data]));
    const equipment = Object.fromEntries(
      Object.entries(next).map(([s, id]) => [s, byId.get(id)!]),
    ) as Equipment;
    try {
      validateEquipment(equipment);
    } catch (error) {
      if (error instanceof ItemError)
        throw new ApiError(HttpStatus.BAD_REQUEST, error.code, error.message);
      throw error;
    }
    await this.items.setEquipment(me.id, changes);
    return this.view(season, { ...me });
  }

  async unequip(accountId: string, slot: EquipSlot): Promise<InventoryView> {
    const { season, me } = await this.mine(accountId);
    await this.items.setEquipment(me.id, { [slot]: null });
    return this.view(season, me);
  }

  /**
   * Zufälliges Item auf dem eigenen Level – nur in Test-Seasons, um Items ohne Dungeon
   * auszuprobieren. In echten Seasons gibt es Items ausschließlich durch Spielen.
   */
  async testLoot(accountId: string): Promise<ItemView> {
    const { season, me } = await this.mine(accountId);
    if (!season.isTest) {
      throw new ApiError(HttpStatus.FORBIDDEN, 'test_season_only', 'Nur in Test-Seasons verfügbar');
    }
    const data = rollLoot(season.game, {
      itemLevel: me.level,
      maxRarity: TEST_LOOT_MAX_RARITY,
      seed: randomUUID(),
    });
    const [id] = await this.items.addItems(accountId, season.id, [{ data, source: 'test' }]);
    return {
      ...data,
      id: id!,
      source: 'test',
      createdAt: new Date().toISOString(),
      equippedIn: null,
    };
  }

  private async view(season: CurrentSeason, me: CharacterRecord): Promise<InventoryView> {
    const [items, equipped, stacks] = await Promise.all([
      this.items.listItems(me.accountId, season.id),
      this.items.equipmentOf(me.id),
      this.economy.stacks(me.accountId, season.id),
    ]);
    const slotOf = new Map(Object.entries(equipped).map(([slot, id]) => [id, slot as EquipSlot]));
    return {
      items: items.map((i) => ({
        ...i.data,
        id: i.id,
        source: i.source,
        createdAt: i.createdAt.toISOString(),
        equippedIn: slotOf.get(i.id) ?? null,
      })),
      equipment: equipped,
      stacks,
      slotsByCategory: Object.fromEntries(
        season.game.items.templates.map((t) => [t.category, [...slotsFor(t.category)]]),
      ) as InventoryView['slotsByCategory'],
    };
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
