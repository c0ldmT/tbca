import { account, character, type BotAgent, type Database } from '@tbca/db';
import type { ClassId } from '@tbca/game-core';
import { and, asc, eq } from 'drizzle-orm';

export interface BotInfo {
  accountId: string;
  agent: BotAgent | null;
  character: { id: string; name: string; level: number; classId: ClassId } | null;
}

export interface BotRepository {
  list(seasonId: string): Promise<BotInfo[]>;
  setAgent(accountId: string, agent: BotAgent | null): Promise<boolean>;
}

export class DrizzleBotRepository implements BotRepository {
  constructor(private readonly db: Database) {}

  async list(seasonId: string): Promise<BotInfo[]> {
    const rows = await this.db
      .select({
        accountId: account.id,
        agent: account.botAgent,
        characterId: character.id,
        name: character.name,
        level: character.level,
        classId: character.class,
      })
      .from(account)
      .leftJoin(
        character,
        and(eq(character.accountId, account.id), eq(character.seasonId, seasonId)),
      )
      .where(eq(account.isBot, true))
      .orderBy(asc(character.level), asc(character.name));
    return rows.map((r) => ({
      accountId: r.accountId,
      agent: (r.agent as BotAgent | null) ?? null,
      character: r.characterId
        ? { id: r.characterId, name: r.name!, level: r.level!, classId: r.classId! }
        : null,
    }));
  }

  async setAgent(accountId: string, agent: BotAgent | null): Promise<boolean> {
    const rows = await this.db
      .update(account)
      .set({ botAgent: agent })
      .where(and(eq(account.id, accountId), eq(account.isBot, true)))
      .returning({ id: account.id });
    return rows.length > 0;
  }
}
