import {
  challengeRequest,
  dailyOpponent,
  dailyTeamOpponent,
  teamChallengeRequest,
  transferCredits,
  type Database,
} from '@tbca/db';
import { and, asc, eq } from 'drizzle-orm';

import type {
  ChallengeRequestRecord,
  DailyOpponents,
  PvpRepository,
  TeamChallengeRequestRecord,
} from './types.js';

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

  async dailyTeamOpponents(teamId: string, day: string): Promise<string[]> {
    const rows = await this.db
      .select({ id: dailyTeamOpponent.opponentTeamId })
      .from(dailyTeamOpponent)
      .where(and(eq(dailyTeamOpponent.teamId, teamId), eq(dailyTeamOpponent.day, day)))
      .orderBy(asc(dailyTeamOpponent.slot));
    return rows.map((r) => r.id);
  }

  async saveDailyTeamOpponents(
    teamId: string,
    day: string,
    ids: readonly string[],
  ): Promise<string[]> {
    if (ids.length > 0)
      await this.db
        .insert(dailyTeamOpponent)
        .values(ids.map((opponentTeamId, slot) => ({ teamId, day, slot, opponentTeamId })))
        .onConflictDoNothing();
    return this.dailyTeamOpponents(teamId, day);
  }

  async createTeamRequest(
    input: Parameters<PvpRepository['createTeamRequest']>[0],
  ): Promise<TeamChallengeRequestRecord> {
    const [row] = await this.db.insert(teamChallengeRequest).values(input).returning();
    return toTeamRequest(row!);
  }

  async findTeamRequest(id: string): Promise<TeamChallengeRequestRecord | null> {
    const [row] = await this.db
      .select()
      .from(teamChallengeRequest)
      .where(eq(teamChallengeRequest.id, id));
    return row ? toTeamRequest(row) : null;
  }

  async pendingTeamRequest(
    challengerTeamId: string,
    opponentTeamId: string,
    size: 2 | 3,
  ): Promise<TeamChallengeRequestRecord | null> {
    const [row] = await this.db
      .select()
      .from(teamChallengeRequest)
      .where(
        and(
          eq(teamChallengeRequest.challengerTeamId, challengerTeamId),
          eq(teamChallengeRequest.opponentTeamId, opponentTeamId),
          eq(teamChallengeRequest.size, size),
          eq(teamChallengeRequest.status, 'pending'),
        ),
      )
      .limit(1);
    return row ? toTeamRequest(row) : null;
  }

  async resolveTeamRequest(
    id: string,
    status: 'accepted' | 'declined' | 'expired',
  ): Promise<boolean> {
    const rows = await this.db
      .update(teamChallengeRequest)
      .set({ status })
      .where(and(eq(teamChallengeRequest.id, id), eq(teamChallengeRequest.status, 'pending')))
      .returning({ id: teamChallengeRequest.id });
    return rows.length > 0;
  }

  async setTeamRequestFight(id: string, fightId: string): Promise<void> {
    await this.db
      .update(teamChallengeRequest)
      .set({ fightId })
      .where(eq(teamChallengeRequest.id, id));
  }
}

function toTeamRequest(r: typeof teamChallengeRequest.$inferSelect): TeamChallengeRequestRecord {
  return { ...r, size: r.size as 2 | 3 };
}
