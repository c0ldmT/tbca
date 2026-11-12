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
  /**
   * Kanal für Liga-Ankündigungen setzen (andere Kanäle des Servers werden abgeschaltet) oder
   * abschalten. Beim Einschalten beginnen die Ankündigungen bei `from` (kein Rückstand).
   */
  setLeagueChannel(guildId: string, channelId: string, enabled: boolean, from: Date): Promise<void>;
  /** Alle Kanäle mit Liga-Ankündigungen. */
  leagueChannels(): Promise<
    { guildId: string; channelId: string; communityId: string; announcedUntil: Date }[]
  >;
  markLeagueAnnounced(channelId: string, until: Date): Promise<void>;
  /** Rolle in der Community setzen (Mitgliedschaft muss bestehen). */
  setRole(
    communityId: string,
    accountId: string,
    role: 'member' | 'moderator' | 'admin',
  ): Promise<void>;
  /** Mitgliedschaft sicherstellen; die erste Community wird Heimat. */
  ensureMember(communityId: string, accountId: string): Promise<void>;
  /**
   * Bucht passive XP in einer Transaktion: `decide` erhält den heutigen Rohstand und liefert
   * neuen Rohstand, Gutschrift und den neuen XP-/Level-Stand des Charakters.
   */
  /** Heutiger Rohstand passiver XP (vor Deckelung) des Accounts. */
  passiveRaw(input: { seasonId: string; accountId: string; day: string }): Promise<number>;
  bookPassive(
    input: {
      seasonId: string;
      accountId: string;
      characterId: string;
      day: string;
      /** Anzahl gebündelter Nachrichten (Standard 1). */
      messages?: number;
    },
    decide: (state: { rawToday: number; xp: number; level: number }) => {
      rawToday: number;
      awarded: number;
      xp: number;
      level: number;
    },
  ): Promise<{ awarded: number; level: number; levelBefore: number }>;
}
