import {
  changeStacks,
  equipment,
  itemInstance,
  shopPurchase,
  stacksOf,
  transferCredits,
  type Database,
} from '@tbca/db';
import { and, eq, inArray } from 'drizzle-orm';

import {
  AlreadyPurchasedError,
  ItemEquippedError,
  type EconomyChange,
  type EconomyRepository,
} from './types.js';

export class DrizzleEconomyRepository implements EconomyRepository {
  constructor(private readonly db: Database) {}

  commit(change: EconomyChange): Promise<{ addedIds: string[] }> {
    const { seasonId, accountId } = change;
    return this.db.transaction(async (tx) => {
      if (change.credits && change.credits.amount !== 0) {
        await transferCredits(tx, {
          seasonId,
          kind: change.credits.kind,
          refId: change.credits.refId ?? null,
          lines: [
            { accountId, amount: change.credits.amount },
            { system: change.credits.system, amount: -change.credits.amount },
          ],
        });
      }
      if (change.stacks) await changeStacks(tx, seasonId, accountId, change.stacks);

      const deletes = change.deleteItems ?? [];
      if (deletes.length > 0) {
        const equipped = await tx
          .select()
          .from(equipment)
          .where(inArray(equipment.itemId, [...deletes]));
        if (equipped.length > 0) throw new ItemEquippedError();
        const removed = await tx
          .delete(itemInstance)
          .where(and(inArray(itemInstance.id, [...deletes]), eq(itemInstance.accountId, accountId)))
          .returning({ id: itemInstance.id });
        if (removed.length !== deletes.length) throw new ItemEquippedError('Item nicht gefunden');
      }
      for (const u of change.updateItems ?? []) {
        await tx
          .update(itemInstance)
          .set({ data: u.data, budget: u.data.budget })
          .where(and(eq(itemInstance.id, u.id), eq(itemInstance.accountId, accountId)));
      }
      let addedIds: string[] = [];
      if (change.addItems?.length) {
        const rows = await tx
          .insert(itemInstance)
          .values(
            change.addItems.map((i) => ({
              seasonId,
              accountId,
              templateId: i.data.templateId,
              itemLevel: i.data.itemLevel,
              rarity: i.data.rarity,
              budget: i.data.budget,
              data: i.data,
              source: i.source,
            })),
          )
          .returning({ id: itemInstance.id });
        addedIds = rows.map((r) => r.id);
      }
      if (change.purchase) {
        const inserted = await tx
          .insert(shopPurchase)
          .values({ seasonId, accountId, ...change.purchase })
          .onConflictDoNothing()
          .returning({ offerId: shopPurchase.offerId });
        if (inserted.length === 0) throw new AlreadyPurchasedError();
      }
      return { addedIds };
    });
  }

  stacks(accountId: string, seasonId: string): Promise<Record<string, number>> {
    return stacksOf(this.db, seasonId, accountId);
  }

  async purchases(accountId: string, seasonId: string, day: string): Promise<string[]> {
    const rows = await this.db
      .select({ offerId: shopPurchase.offerId })
      .from(shopPurchase)
      .where(
        and(
          eq(shopPurchase.accountId, accountId),
          eq(shopPurchase.seasonId, seasonId),
          eq(shopPurchase.day, day),
        ),
      );
    return rows.map((r) => r.offerId);
  }
}
