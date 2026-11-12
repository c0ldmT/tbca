import {
  character,
  community,
  communityChannel,
  communityMember,
  xpLedgerDaily,
  type Database,
} from '@tbca/db';
import { and, eq, sql } from 'drizzle-orm';

import type { DiscordRepository, GuildCommunity } from './types.js';

export class DrizzleDiscordRepository implements DiscordRepository {
  constructor(private readonly db: Database) {}

  async communityForGuild(guildId: string): Promise<GuildCommunity | null> {
    const [guild] = await this.db
      .select({ communityId: communityChannel.communityId, name: community.name })
      .from(communityChannel)
      .innerJoin(community, eq(community.id, communityChannel.communityId))
      .where(
        and(eq(communityChannel.kind, 'discord_guild'), eq(communityChannel.externalId, guildId)),
      );
    if (!guild) return null;
    const channels = await this.db
      .select({ id: communityChannel.externalId })
      .from(communityChannel)
      .where(
        and(
          eq(communityChannel.kind, 'discord_channel'),
          eq(communityChannel.parentExternalId, guildId),
          eq(communityChannel.xpEnabled, true),
        ),
      );
    return { ...guild, xpChannels: channels.map((c) => c.id) };
  }

  async ensureGuildCommunity(guildId: string, name: string): Promise<GuildCommunity> {
    const existing = await this.communityForGuild(guildId);
    if (existing) return existing;
    await this.db.transaction(async (tx) => {
      const slug = `discord-${guildId}`;
      const [row] = await tx
        .insert(community)
        .values({ slug, name: name.slice(0, 100) })
        .onConflictDoUpdate({ target: community.slug, set: { name: name.slice(0, 100) } })
        .returning({ id: community.id });
      await tx
        .insert(communityChannel)
        .values({ communityId: row!.id, kind: 'discord_guild', externalId: guildId })
        .onConflictDoNothing();
    });
    return (await this.communityForGuild(guildId))!;
  }

  async setChannelXp(guildId: string, channelId: string, enabled: boolean): Promise<void> {
    const guild = await this.communityForGuild(guildId);
    if (!guild) throw new Error('Server ist keiner Community zugeordnet');
    await this.db
      .insert(communityChannel)
      .values({
        communityId: guild.communityId,
        kind: 'discord_channel',
        externalId: channelId,
        parentExternalId: guildId,
        xpEnabled: enabled,
      })
      .onConflictDoUpdate({
        target: [communityChannel.kind, communityChannel.externalId],
        // Kanal-IDs sind global eindeutig; ein umgezogener Server übernimmt den Eintrag.
        set: { xpEnabled: enabled, communityId: guild.communityId, parentExternalId: guildId },
      });
  }

  async setLeagueChannel(
    guildId: string,
    channelId: string,
    enabled: boolean,
    from: Date,
  ): Promise<void> {
    const guild = await this.communityForGuild(guildId);
    if (!guild) throw new Error('Server ist keiner Community zugeordnet');
    await this.db.transaction(async (tx) => {
      if (enabled)
        await tx
          .update(communityChannel)
          .set({ leagueNews: false })
          .where(
            and(
              eq(communityChannel.kind, 'discord_channel'),
              eq(communityChannel.parentExternalId, guildId),
            ),
          );
      await tx
        .insert(communityChannel)
        .values({
          communityId: guild.communityId,
          kind: 'discord_channel',
          externalId: channelId,
          parentExternalId: guildId,
          leagueNews: enabled,
          leagueAnnouncedUntil: from,
        })
        .onConflictDoUpdate({
          target: [communityChannel.kind, communityChannel.externalId],
          set: {
            leagueNews: enabled,
            ...(enabled ? { leagueAnnouncedUntil: from } : {}),
            communityId: guild.communityId,
            parentExternalId: guildId,
          },
        });
    });
  }

  async leagueChannels() {
    const rows = await this.db
      .select({
        guildId: communityChannel.parentExternalId,
        channelId: communityChannel.externalId,
        communityId: communityChannel.communityId,
        announcedUntil: communityChannel.leagueAnnouncedUntil,
      })
      .from(communityChannel)
      .where(
        and(eq(communityChannel.kind, 'discord_channel'), eq(communityChannel.leagueNews, true)),
      );
    return rows.map((r) => ({
      guildId: r.guildId ?? '',
      channelId: r.channelId,
      communityId: r.communityId,
      announcedUntil: r.announcedUntil ?? new Date(0),
    }));
  }

  async markLeagueAnnounced(channelId: string, until: Date): Promise<void> {
    await this.db
      .update(communityChannel)
      .set({ leagueAnnouncedUntil: until })
      .where(
        and(
          eq(communityChannel.kind, 'discord_channel'),
          eq(communityChannel.externalId, channelId),
        ),
      );
  }

  async setRole(
    communityId: string,
    accountId: string,
    role: 'member' | 'moderator' | 'admin',
  ): Promise<void> {
    await this.db
      .update(communityMember)
      .set({ role })
      .where(
        and(eq(communityMember.communityId, communityId), eq(communityMember.accountId, accountId)),
      );
  }

  async ensureMember(communityId: string, accountId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [home] = await tx
        .select({ communityId: communityMember.communityId })
        .from(communityMember)
        .where(and(eq(communityMember.accountId, accountId), eq(communityMember.isHome, true)));
      await tx
        .insert(communityMember)
        .values({ communityId, accountId, isHome: !home, homeChangedAt: home ? null : new Date() })
        .onConflictDoNothing();
    });
  }

  async passiveRaw(input: { seasonId: string; accountId: string; day: string }): Promise<number> {
    const [row] = await this.db
      .select({ raw: xpLedgerDaily.passiveRaw })
      .from(xpLedgerDaily)
      .where(
        and(
          eq(xpLedgerDaily.seasonId, input.seasonId),
          eq(xpLedgerDaily.accountId, input.accountId),
          eq(xpLedgerDaily.day, input.day),
        ),
      );
    return row?.raw ?? 0;
  }

  bookPassive(
    input: {
      seasonId: string;
      accountId: string;
      characterId: string;
      day: string;
      messages?: number;
    },
    decide: (state: { rawToday: number; xp: number; level: number }) => {
      rawToday: number;
      awarded: number;
      xp: number;
      level: number;
    },
  ): Promise<{ awarded: number; level: number; levelBefore: number }> {
    return this.db.transaction(async (tx) => {
      await tx
        .insert(xpLedgerDaily)
        .values({ seasonId: input.seasonId, accountId: input.accountId, day: input.day })
        .onConflictDoNothing();
      const [ledger] = await tx
        .select()
        .from(xpLedgerDaily)
        .where(
          and(
            eq(xpLedgerDaily.seasonId, input.seasonId),
            eq(xpLedgerDaily.accountId, input.accountId),
            eq(xpLedgerDaily.day, input.day),
          ),
        )
        .for('update');
      const [char] = await tx
        .select()
        .from(character)
        .where(eq(character.id, input.characterId))
        .for('update');
      const result = decide({ rawToday: ledger!.passiveRaw, xp: char!.xp, level: char!.level });
      await tx
        .update(xpLedgerDaily)
        .set({
          passiveRaw: result.rawToday,
          passiveAwarded: sql`${xpLedgerDaily.passiveAwarded} + ${result.awarded}`,
          messages: sql`${xpLedgerDaily.messages} + ${input.messages ?? 1}`,
        })
        .where(
          and(
            eq(xpLedgerDaily.seasonId, input.seasonId),
            eq(xpLedgerDaily.accountId, input.accountId),
            eq(xpLedgerDaily.day, input.day),
          ),
        );
      if (result.awarded > 0) {
        await tx
          .update(character)
          .set({ xp: result.xp, level: result.level })
          .where(eq(character.id, input.characterId));
      }
      return { awarded: result.awarded, level: result.level, levelBefore: char!.level };
    });
  }
}
