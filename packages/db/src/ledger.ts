import { and, eq, sql } from 'drizzle-orm';

import type { Database } from './client.js';
import { creditEntry, creditTransaction, wallet } from './schema.js';

/** Datenbank oder laufende Transaktion. */
export type Executor = Pick<Database, 'select' | 'insert' | 'update' | 'delete' | 'execute'>;

/** Systemkonten als Gegenbuchung: Quellen (Belohnungen) und Senken (Gebühren). */
export type SystemAccount =
  | 'source:pvp'
  | 'source:admin'
  | 'source:shop'
  | 'source:dungeon'
  | 'sink:respec'
  | 'sink:rename'
  | 'sink:shop'
  | 'sink:crafting'
  | 'sink:dungeon'
  | 'sink:pvp'
  | 'sink:admin';

export type LedgerLine =
  | { readonly accountId: string; readonly amount: number }
  | { readonly system: SystemAccount; readonly amount: number };

export class InsufficientCreditsError extends Error {
  override readonly name = 'InsufficientCreditsError';
}

export interface Transfer {
  seasonId: string;
  /** Art der Buchung für Auswertungen, z. B. pvp_reward oder respec. */
  kind: string;
  refId?: string | null;
  lines: readonly LedgerLine[];
}

/**
 * Doppelte Buchführung (Spezifikation, Abschnitt 12): Jede Buchung besteht aus Zeilen, die sich
 * zu 0 summieren. Spielerkonten führen zusätzlich einen Saldo (`wallet`), der nie negativ wird;
 * reicht er nicht, wirft die Buchung InsufficientCreditsError und nichts wird geschrieben.
 * Muss innerhalb einer Transaktion aufgerufen werden.
 */
export async function transferCredits(tx: Executor, transfer: Transfer): Promise<string> {
  const lines = transfer.lines.filter((l) => l.amount !== 0);
  if (lines.some((l) => !Number.isSafeInteger(l.amount)))
    throw new RangeError('Beträge müssen ganzzahlig sein');
  if (lines.reduce((sum, l) => sum + l.amount, 0) !== 0) {
    throw new RangeError('Eine Buchung muss sich zu 0 summieren');
  }

  // Spielerkonten zuerst belasten: schlägt das fehl, ist noch nichts geschrieben.
  for (const line of lines) {
    if (!('accountId' in line)) continue;
    if (line.amount < 0) {
      const updated = await tx
        .update(wallet)
        .set({ balance: sql`${wallet.balance} + ${line.amount}` })
        .where(
          and(
            eq(wallet.seasonId, transfer.seasonId),
            eq(wallet.accountId, line.accountId),
            sql`${wallet.balance} >= ${-line.amount}`,
          ),
        )
        .returning({ balance: wallet.balance });
      if (updated.length === 0) throw new InsufficientCreditsError();
    } else {
      await tx
        .insert(wallet)
        .values({ seasonId: transfer.seasonId, accountId: line.accountId, balance: line.amount })
        .onConflictDoUpdate({
          target: [wallet.seasonId, wallet.accountId],
          set: { balance: sql`${wallet.balance} + ${line.amount}` },
        });
    }
  }

  const [row] = await tx
    .insert(creditTransaction)
    .values({ seasonId: transfer.seasonId, kind: transfer.kind, refId: transfer.refId ?? null })
    .returning({ id: creditTransaction.id });
  await tx.insert(creditEntry).values(
    lines.map((l) => ({
      transactionId: row!.id,
      seasonId: transfer.seasonId,
      accountId: 'accountId' in l ? l.accountId : null,
      systemAccount: 'system' in l ? l.system : null,
      amount: l.amount,
    })),
  );
  return row!.id;
}

/** Saldo eines Spielers in einer Season (0 ohne Buchungen). */
export async function creditBalance(
  db: Executor,
  seasonId: string,
  accountId: string,
): Promise<number> {
  const [row] = await db
    .select({ balance: wallet.balance })
    .from(wallet)
    .where(and(eq(wallet.seasonId, seasonId), eq(wallet.accountId, accountId)));
  return row?.balance ?? 0;
}
