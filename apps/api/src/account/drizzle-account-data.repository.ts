import {
  account,
  character,
  communityMember,
  creditEntry,
  dungeonRun,
  equipment,
  fight,
  fightParticipant,
  identity,
  itemInstance,
  loadout,
  materialStack,
  session,
  team,
  teamMember,
  wallet,
  xpLedgerDaily,
  type Database,
} from '@tbca/db';
import type { CombatantSnapshot } from '@tbca/game-core';
import { and, asc, eq, inArray, ne } from 'drizzle-orm';

import type { AccountDataRepository } from './types.js';

export class DrizzleAccountDataRepository implements AccountDataRepository {
  constructor(private readonly db: Database) {}

  async export(accountId: string): Promise<Record<string, unknown>> {
    const db = this.db;
    const [acc] = await db.select().from(account).where(eq(account.id, accountId));
    const characters = await db.select().from(character).where(eq(character.accountId, accountId));
    const characterIds = characters.map((c) => c.id);
    const byCharacter = <T>(rows: Promise<T[]>) =>
      characterIds.length ? rows : Promise.resolve([] as T[]);
    return {
      exportedAt: new Date().toISOString(),
      account: acc,
      identities: await db.select().from(identity).where(eq(identity.accountId, accountId)),
      // Sessions nur als Metadaten; Token-Hashes gehören nicht in einen Export.
      sessions: await db
        .select({
          createdAt: session.createdAt,
          lastSeenAt: session.lastSeenAt,
          expiresAt: session.expiresAt,
        })
        .from(session)
        .where(eq(session.accountId, accountId)),
      communities: await db
        .select()
        .from(communityMember)
        .where(eq(communityMember.accountId, accountId)),
      teams: await db.select().from(teamMember).where(eq(teamMember.accountId, accountId)),
      characters,
      loadouts: await byCharacter(
        db.select().from(loadout).where(inArray(loadout.characterId, characterIds)),
      ),
      equipment: await byCharacter(
        db.select().from(equipment).where(inArray(equipment.characterId, characterIds)),
      ),
      items: await db.select().from(itemInstance).where(eq(itemInstance.accountId, accountId)),
      materials: await db
        .select()
        .from(materialStack)
        .where(eq(materialStack.accountId, accountId)),
      wallets: await db.select().from(wallet).where(eq(wallet.accountId, accountId)),
      credits: await db.select().from(creditEntry).where(eq(creditEntry.accountId, accountId)),
      xpDaily: await db.select().from(xpLedgerDaily).where(eq(xpLedgerDaily.accountId, accountId)),
      dungeonRuns: await db
        .select({
          id: dungeonRun.id,
          status: dungeonRun.status,
          floor: dungeonRun.floor,
          xpGained: dungeonRun.xpGained,
          createdAt: dungeonRun.createdAt,
          endedAt: dungeonRun.endedAt,
        })
        .from(dungeonRun)
        .where(eq(dungeonRun.accountId, accountId)),
      fights: await byCharacter(
        db
          .select({
            fightId: fightParticipant.fightId,
            characterId: fightParticipant.characterId,
            won: fightParticipant.won,
            xpAwarded: fightParticipant.xpAwarded,
            creditsAwarded: fightParticipant.creditsAwarded,
            createdAt: fight.createdAt,
          })
          .from(fightParticipant)
          .innerJoin(fight, eq(fight.id, fightParticipant.fightId))
          .where(inArray(fightParticipant.characterId, characterIds))
          .orderBy(asc(fight.createdAt)),
      ),
    };
  }

  async delete(accountId: string, placeholderName: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const characters = await tx
        .select({ id: character.id })
        .from(character)
        .where(eq(character.accountId, accountId));
      const ids = new Set(characters.map((c) => c.id));

      // Namen in gespeicherten Kämpfen (auch Replays anderer) durch einen Platzhalter ersetzen.
      if (ids.size > 0) {
        const fights = await tx
          .selectDistinct({ id: fight.id, input: fight.input })
          .from(fight)
          .innerJoin(fightParticipant, eq(fightParticipant.fightId, fight.id))
          .where(inArray(fightParticipant.characterId, [...ids]));
        for (const f of fights) {
          const teams = f.input.teams.map((t: readonly CombatantSnapshot[]) =>
            t.map((c) => (ids.has(c.id) ? { ...c, name: placeholderName } : c)),
          );
          await tx
            .update(fight)
            .set({ input: { ...f.input, teams } })
            .where(eq(fight.id, f.id));
        }
      }

      // Teams: Kapitänsrolle weitergeben, verwaiste Teams auflösen.
      const memberships = await tx
        .select()
        .from(teamMember)
        .where(eq(teamMember.accountId, accountId));
      for (const m of memberships) {
        const [next] = await tx
          .select({ accountId: teamMember.accountId })
          .from(teamMember)
          .where(and(eq(teamMember.teamId, m.teamId), ne(teamMember.accountId, accountId)))
          .orderBy(asc(teamMember.joinedAt))
          .limit(1);
        if (!next) await tx.delete(team).where(eq(team.id, m.teamId));
        else {
          await tx
            .update(team)
            .set({ captainAccountId: next.accountId })
            .where(and(eq(team.id, m.teamId), eq(team.captainAccountId, accountId)));
        }
      }

      // Der Rest hängt per Fremdschlüssel am Account (löschen bzw. anonymisieren).
      await tx.delete(account).where(eq(account.id, accountId));
    });
  }

  async setLocale(accountId: string, locale: 'de' | 'en' | null): Promise<void> {
    await this.db.update(account).set({ locale }).where(eq(account.id, accountId));
  }
}
