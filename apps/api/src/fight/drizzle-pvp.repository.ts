import { challengeRequest, dailyOpponent, transferCredits, type Database } from '@tbca/db';
import { and, asc, eq } from 'drizzle-orm';

import type { ChallengeRequestRecord, DailyOpponents, PvpRepository } from './types.js';

export class DrizzlePvpRepository implements PvpRepository {
  constructor(private readonly db: Database) {}

  async dailyOpponents(characterId: string, day: string): Promise<DailyOpponents> {
    const rows = await this.db
      .select({ id: dailyOpponent.opponentId, rerolled: dailyOpponent.rerolled })
      .from(dailyOpponent)
      .where(and(eq(dailyOpponent.characterId, characterId), eq(dailyOpponent.day, day)))
      .orderBy(asc(dailyOpponent.slot));
    return { ids: rows.map((r) => r.id), rerolled: rows.some((r) => r.rerolled) };
  }

  async saveDailyOpponents(
    characterId: string,
    day: string,
    ids: readonly string[],
  ): Promise<DailyOpponents> {
    if (ids.length > 0)
      // Gleichzeitige erste Abrufe: wer zuerst schreibt, gewinnt; die anderen lesen nach
      await this.db
        .insert(dailyOpponent)
        .values(ids.map((opponentId, slot) => ({ characterId, day, slot, opponentId })))
        .onConflictDoNothing();
    return this.dailyOpponents(characterId, day);
  }

  rerollDailyOpponents(input: {
    characterId: string;
    day: string;
    ids: readonly string[];
    charge: { seasonId: string; accountId: string; amount: number };
  }): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const current = await tx
        .select({ rerolled: dailyOpponent.rerolled })
        .from(dailyOpponent)
        .where(
          and(eq(dailyOpponent.characterId, input.characterId), eq(dailyOpponent.day, input.day)),
        )
        .for('update');
      if (current.some((r) => r.rerolled)) return false;
      if (input.charge.amount > 0)
        await transferCredits(tx, {
          seasonId: input.charge.seasonId,
          kind: 'opponent_reroll',
          lines: [
            { accountId: input.charge.accountId, amount: -input.charge.amount },
            { system: 'sink:pvp', amount: input.charge.amount },
          ],
        });
      await tx
        .delete(dailyOpponent)
        .where(
          and(eq(dailyOpponent.characterId, input.characterId), eq(dailyOpponent.day, input.day)),
        );
      if (input.ids.length)
        await tx.insert(dailyOpponent).values(
          input.ids.map((opponentId, slot) => ({
            characterId: input.characterId,
            day: input.day,
            slot,
            opponentId,
            rerolled: true,
          })),
        );
      return true;
    });
  }

  async createRequest(
    input: Pick<
      ChallengeRequestRecord,
      'seasonId' | 'challengerId' | 'opponentId' | 'mode' | 'expiresAt'
    >,
  ): Promise<ChallengeRequestRecord> {
    const [row] = await this.db.insert(challengeRequest).values(input).returning();
    return row!;
  }

  async findRequest(id: string): Promise<ChallengeRequestRecord | null> {
    const [row] = await this.db.select().from(challengeRequest).where(eq(challengeRequest.id, id));
    return row ?? null;
  }

  async pendingRequest(
    challengerId: string,
    opponentId: string,
  ): Promise<ChallengeRequestRecord | null> {
    const [row] = await this.db
      .select()
      .from(challengeRequest)
      .where(
        and(
          eq(challengeRequest.challengerId, challengerId),
          eq(challengeRequest.opponentId, opponentId),
          eq(challengeRequest.status, 'pending'),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async resolveRequest(id: string, status: 'accepted' | 'declined' | 'expired'): Promise<boolean> {
    const rows = await this.db
      .update(challengeRequest)
      .set({ status })
      .where(and(eq(challengeRequest.id, id), eq(challengeRequest.status, 'pending')))
      .returning({ id: challengeRequest.id });
    return rows.length > 0;
  }

  async setRequestFight(id: string, fightId: string): Promise<void> {
    await this.db.update(challengeRequest).set({ fightId }).where(eq(challengeRequest.id, id));
  }
}
