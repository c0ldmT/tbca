import { community, communityMember, team, teamMember, type Database } from '@tbca/db';
import { and, asc, eq, ilike, inArray, sql } from 'drizzle-orm';

import { TeamConflictError, type TeamRecord, type TeamRepository } from './types.js';

function conflict(error: unknown): TeamConflictError | null {
  for (let e: unknown = error; e && typeof e === 'object'; e = (e as { cause?: unknown }).cause) {
    const pg = e as { code?: string; constraint?: string };
    if (pg.code !== '23505') continue;
    if (pg.constraint === 'team_name_idx') return new TeamConflictError('team_name_taken');
    if (pg.constraint === 'team_tag_idx') return new TeamConflictError('team_tag_taken');
    return new TeamConflictError('already_in_team');
  }
  return null;
}

export class DrizzleTeamRepository implements TeamRepository {
  constructor(private readonly db: Database) {}

  async communities(accountId: string) {
    const rows = await this.db
      .select({
        id: community.id,
        slug: community.slug,
        name: community.name,
        member: sql<boolean>`${communityMember.accountId} is not null`,
        home: sql<boolean>`coalesce(${communityMember.isHome}, false)`,
      })
      .from(community)
      .leftJoin(
        communityMember,
        and(
          eq(communityMember.communityId, community.id),
          eq(communityMember.accountId, accountId),
        ),
      )
      .orderBy(asc(community.name));
    return rows;
  }

  async joinCommunity(communityId: string, accountId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [home] = await tx
        .select({ id: communityMember.communityId })
        .from(communityMember)
        .where(and(eq(communityMember.accountId, accountId), eq(communityMember.isHome, true)));
      await tx
        .insert(communityMember)
        .values({ communityId, accountId, isHome: !home, homeChangedAt: home ? null : new Date() })
        .onConflictDoNothing();
    });
  }

  async isCommunityMember(communityId: string, accountId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: communityMember.accountId })
      .from(communityMember)
      .where(
        and(eq(communityMember.communityId, communityId), eq(communityMember.accountId, accountId)),
      );
    return Boolean(row);
  }

  async teamsOf(accountId: string): Promise<TeamRecord[]> {
    const ids = this.db
      .select({ id: teamMember.teamId })
      .from(teamMember)
      .where(eq(teamMember.accountId, accountId));
    return this.load(await this.db.select().from(team).where(inArray(team.id, ids)));
  }

  async find(id: string): Promise<TeamRecord | null> {
    return (await this.load(await this.db.select().from(team).where(eq(team.id, id))))[0] ?? null;
  }

  async findByCode(code: string): Promise<TeamRecord | null> {
    const rows = await this.db
      .select()
      .from(team)
      .where(sql`upper(${team.joinCode}) = upper(${code})`);
    return (await this.load(rows))[0] ?? null;
  }

  async search(query: string, limit: number): Promise<TeamRecord[]> {
    const pattern = `%${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const rows = await this.db
      .select()
      .from(team)
      .where(query ? sql`(${ilike(team.name, pattern)} or ${ilike(team.tag, pattern)})` : undefined)
      .orderBy(asc(team.name))
      .limit(limit);
    return this.load(rows);
  }

  async create(record: Omit<TeamRecord, 'id' | 'members' | 'communityName'>): Promise<TeamRecord> {
    try {
      const id = await this.db.transaction(async (tx) => {
        const [row] = await tx.insert(team).values(record).returning({ id: team.id });
        if (record.captainAccountId) {
          await tx.insert(teamMember).values({
            teamId: row!.id,
            accountId: record.captainAccountId,
            communityId: record.communityId,
          });
        }
        return row!.id;
      });
      return (await this.find(id))!;
    } catch (error) {
      throw conflict(error) ?? error;
    }
  }

  async addMember(record: TeamRecord, accountId: string): Promise<void> {
    try {
      await this.db
        .insert(teamMember)
        .values({ teamId: record.id, accountId, communityId: record.communityId });
    } catch (error) {
      throw conflict(error) ?? error;
    }
  }

  async removeMember(teamId: string, accountId: string): Promise<void> {
    await this.db
      .delete(teamMember)
      .where(and(eq(teamMember.teamId, teamId), eq(teamMember.accountId, accountId)));
  }

  async update(
    teamId: string,
    patch: Partial<Pick<TeamRecord, 'captainAccountId' | 'focus' | 'lineup2' | 'lineup3'>>,
  ) {
    await this.db.update(team).set(patch).where(eq(team.id, teamId));
  }

  async remove(teamId: string): Promise<void> {
    await this.db.delete(team).where(eq(team.id, teamId));
  }

  private async load(rows: (typeof team.$inferSelect)[]): Promise<TeamRecord[]> {
    if (rows.length === 0) return [];
    const members = await this.db
      .select()
      .from(teamMember)
      .where(
        inArray(
          teamMember.teamId,
          rows.map((r) => r.id),
        ),
      )
      .orderBy(asc(teamMember.joinedAt));
    const communities = await this.db
      .select({ id: community.id, name: community.name })
      .from(community)
      .where(
        inArray(
          community.id,
          rows.map((r) => r.communityId),
        ),
      );
    return rows.map((r) => ({
      id: r.id,
      communityId: r.communityId,
      communityName: communities.find((c) => c.id === r.communityId)?.name ?? '',
      name: r.name,
      tag: r.tag,
      logo: r.logo,
      captainAccountId: r.captainAccountId,
      joinCode: r.joinCode,
      focus: r.focus,
      lineup2: r.lineup2,
      lineup3: r.lineup3,
      members: members.filter((m) => m.teamId === r.id).map((m) => m.accountId),
    }));
  }
}
