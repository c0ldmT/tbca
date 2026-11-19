export interface GuildCommunity {
  communityId: string;
  name: string;
  /** Kanäle, in denen Nachrichten XP geben. */
  xpChannels: string[];
}

/** Datenzugriffe für Discord-Communities und passive XP. */
export interface DiscordRepository {
  communityForGuild(guildId: string): Promise<GuildCommunity | null>;
  /** Legt eine Community für den Server an (oder liefert die vorhandene). */
  ensureGuildCommunity(guildId: string, name: string): Promise<GuildCommunity>;
  setChannelXp(guildId: string, channelId: string, enabled: boolean): Promise<void>;
  /** Mitgliedschaft sicherstellen; die erste Community wird Heimat. */
  ensureMember(communityId: string, accountId: string): Promise<void>;
  /**
   * Bucht passive XP in einer Transaktion: `decide` erhält den heutigen Rohstand und liefert
   * neuen Rohstand, Gutschrift und den neuen XP-/Level-Stand des Charakters.
   */
  bookPassive(
    input: { seasonId: string; accountId: string; characterId: string; day: string },
    decide: (state: { rawToday: number; xp: number; level: number }) => {
      rawToday: number;
      awarded: number;
      xp: number;
      level: number;
    },
  ): Promise<{ awarded: number; level: number; levelBefore: number }>;
}
