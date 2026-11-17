import { and, eq, sql } from 'drizzle-orm';

import type { Executor } from './ledger.js';
import { materialStack } from './schema.js';

export class InsufficientMaterialsError extends Error {
  override readonly name = 'InsufficientMaterialsError';
}

/**
 * Ändert Materialien und Verbrauchsgüter um die angegebenen Mengen. Abzüge laufen zuerst und
 * nur, wenn genug vorhanden ist; sonst wirft die Funktion und die Transaktion rollt zurück.
 */
export async function changeStacks(
  tx: Executor,
  seasonId: string,
  accountId: string,
  deltas: Readonly<Record<string, number>>,
): Promise<void> {
  const entries = Object.entries(deltas)
    .filter(([, d]) => d !== 0)
    .sort(([, a], [, b]) => a - b);
  for (const [stackId, delta] of entries) {
    if (delta < 0) {
      const updated = await tx
        .update(materialStack)
        .set({ quantity: sql`${materialStack.quantity} + ${delta}` })
        .where(
          and(
            eq(materialStack.seasonId, seasonId),
            eq(materialStack.accountId, accountId),
            eq(materialStack.stackId, stackId),
            sql`${materialStack.quantity} >= ${-delta}`,
          ),
        )
        .returning({ quantity: materialStack.quantity });
      if (updated.length === 0) throw new InsufficientMaterialsError(stackId);
    } else {
      await tx
        .insert(materialStack)
        .values({ seasonId, accountId, stackId, quantity: delta })
        .onConflictDoUpdate({
          target: [materialStack.seasonId, materialStack.accountId, materialStack.stackId],
          set: { quantity: sql`${materialStack.quantity} + ${delta}` },
        });
    }
  }
}

export async function stacksOf(
  db: Executor,
  seasonId: string,
  accountId: string,
): Promise<Record<string, number>> {
  const rows = await db
    .select({ stackId: materialStack.stackId, quantity: materialStack.quantity })
    .from(materialStack)
    .where(and(eq(materialStack.seasonId, seasonId), eq(materialStack.accountId, accountId)));
  return Object.fromEntries(rows.filter((r) => r.quantity > 0).map((r) => [r.stackId, r.quantity]));
}
