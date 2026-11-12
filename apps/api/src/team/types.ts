import type { TargetSelector } from '@tbca/game-core';

export interface TeamRecord {
  id: string;
  communityId: string;
  communityName: string;
  name: string;
  tag: string;
  logo: string;
  captainAccountId: string | null;
  joinCode: string;
  focus: TargetSelector;
  lineup2: string[];
  lineup3: string[];
  /** Mitglieder in Beitrittsreihenfolge. */
  members: string[];
}

export class TeamConflictError extends Error {
  override readonly name = 'TeamConflictError';
  constructor(readonly code: 'team_name_taken' | 'team_tag_taken' | 'already_in_team') {
    super(code);
  }
}

export type CommunityRole = 'member' | 'moderator' | 'admin';

export interface CommunityMemberRecord {
  accountId: string;
  role: CommunityRole;
  isHome: boolean;
  joinedAt: Date;
}

export interface TeamRepository {
  communities(accountId: string): Promise<
    {
      id: string;
      slug: string;
      name: string;
      member: boolean;
      home: boolean;
      role: CommunityRole | null;
    }[]
  >;
  members(communityId: string): Promise<CommunityMemberRecord[]>;
  setRole(communityId: string, accountId: string, role: CommunityRole): Promise<boolean>;
  joinCommunity(communityId: string, accountId: string): Promise<void>;
  isCommunityMember(communityId: string, accountId: string): Promise<boolean>;
  teamsOf(accountId: string): Promise<TeamRecord[]>;
  find(id: string): Promise<TeamRecord | null>;
  findByCode(code: string): Promise<TeamRecord | null>;
  search(query: string, limit: number): Promise<TeamRecord[]>;
  /** Zufällige Stichprobe aller Teams (Kandidaten für die Tages-Teams). */
  sample(limit: number): Promise<TeamRecord[]>;
  create(team: Omit<TeamRecord, 'id' | 'members' | 'communityName'>): Promise<TeamRecord>;
  addMember(team: TeamRecord, accountId: string): Promise<void>;
  removeMember(teamId: string, accountId: string): Promise<void>;
  update(
    teamId: string,
    patch: Partial<Pick<TeamRecord, 'captainAccountId' | 'focus' | 'lineup2' | 'lineup3'>>,
  ): Promise<void>;
  remove(teamId: string): Promise<void>;
}
