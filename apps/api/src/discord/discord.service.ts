import { randomUUID } from 'node:crypto';

import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  applyPassiveCap,
  itemNames,
  levelFromXp,
  messageXp,
  passiveHardCap,
  Xoshiro128ss,
  type ClassId,
  type Clock,
} from '@tbca/game-core';
import type {
  ChallengeResponse,
  DiscordActivityResult,
  DiscordDungeonView,
  DiscordFightSummary,
  DiscordLeagueNews,
  DiscordLeagueView,
  DiscordProfileView,
  DiscordTeamFightSummary,
  DiscordTeamView,
  DungeonView,
  PassiveFlushResult,
} from '@tbca/shared';

import type { AccountRepository } from '../auth/types.js';
import { CharacterService } from '../character/character.service.js';
import type { CharacterRepository } from '../character/types.js';
import { ApiError } from '../common/api-error.js';
import type { Env } from '../config/env.js';
import { dayKey } from '../fight/day.js';
import { DungeonService } from '../dungeon/dungeon.service.js';
import { FightService } from '../fight/fight.service.js';
import { LeagueService } from '../league/league.service.js';
import { TeamService } from '../team/team.service.js';
import { SeasonService } from '../game/season.js';
import type { RateLimiter } from '../limits/rate-limiter.js';
import {
  ACCOUNT_REPOSITORY,
  CHARACTER_REPOSITORY,
  CLOCK,
  DISCORD_REPOSITORY,
  ENV,
  RATE_LIMITER,
} from '../tokens.js';
import type { DiscordRepository, GuildCommunity } from './types.js';

/**
 * Discord-Anbindung (Spezifikation, Abschnitte 4 und 11): Community-Onboarding, Registrierung
 * per Slash-Command (Schatten-Account), Profil, Herausforderungen und Aktivitäts-XP.
 */
/** Warteschlange vorgemerkter passiver XP in Valkey. */
const PASSIVE_QUEUE = 'xp:passive:pending';

interface PassiveEntry {
  seasonId: string;
  accountId: string;
  characterId: string;
  day: string;
  amount: number;
}

@Injectable()
export class DiscordService {
  constructor(
    @Inject(DISCORD_REPOSITORY) private readonly discord: DiscordRepository,
    @Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepository,
    @Inject(CHARACTER_REPOSITORY) private readonly characters: CharacterRepository,
    @Inject(CharacterService) private readonly characterService: CharacterService,
    @Inject(FightService) private readonly fights: FightService,
    @Inject(SeasonService) private readonly seasons: SeasonService,
    @Inject(RATE_LIMITER) private readonly limiter: RateLimiter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ENV) private readonly env: Env,
    @Inject(DungeonService) private readonly dungeonService: DungeonService,
    @Inject(TeamService) private readonly teamService: TeamService,
    @Inject(LeagueService) private readonly league: LeagueService,
  ) {}

  /** Dungeon über Discord: Status, Start oder Entscheidung; Antwort für Nachricht mit Buttons. */
  async dungeon(input: {
    userId: string;
    action: 'status' | 'start' | 'continue' | 'heal' | 'leave';
    injectors?: number | undefined;
    backupChip?: boolean | undefined;
  }): Promise<DiscordDungeonView> {
    const accountId = await this.requireAccount(input.userId);
    const before = await this.dungeonService.status(accountId);
    let after: DungeonView;
    switch (input.action) {
      case 'status':
        after = before;
        break;
      case 'start':
        after = await this.dungeonService.start(accountId, {
          injectors: input.injectors ?? 0,
          backupChip: input.backupChip ?? false,
        });
        break;
      case 'continue':
        after = await this.dungeonService.continue(accountId);
        break;
      case 'heal':
        after = await this.dungeonService.heal(accountId);
        break;
      case 'leave':
        after = await this.dungeonService.leave(accountId);
        break;
    }
    const run = after.run;
    const season = await this.seasons.current();
    const fought =
      (input.action === 'continue' || input.action === 'start') && run
        ? {
            floor: input.action === 'start' ? 1 : (before.run?.floor ?? 0) + 1,
            won: run.status === 'active' || run.status === 'left' || run.status === 'timed_out',
          }
        : null;
    return {
      status: run?.status ?? 'none',
      floor: run?.floor ?? 0,
      hp: run?.hp ?? 0,
      maxHp: run?.maxHp ?? 0,
      injectors: run?.injectors ?? 0,
      finds: run?.loot.count ?? 0,
      credits: run && !run.loot.sealed ? run.loot.credits : 0,
      items:
        run && !run.loot.sealed
          ? run.loot.items.map((i) => ({
              templateId: i.templateId,
              rarity: i.rarity,
              names: itemNames(season.game, i.templateId),
            }))
          : [],
      xpGained: run?.xpGained ?? 0,
      next: run?.next
        ? { floor: run.next.floor, monsterLevel: run.next.monsterLevel, boss: run.next.boss }
        : null,
      lastFloor: fought,
      runsLeft: Math.max(0, after.runsPerDay - after.runsToday),
      fee: after.fee,
      canHeal: !!run && run.status === 'active' && run.injectors > 0 && run.hp < run.maxHp,
      url: `${this.env.WEB_ORIGIN}/fight/dungeon`,
    };
  }

  /** Eigene Teams für Discord. */
  async teams(userId: string): Promise<DiscordTeamView> {
    const accountId = await this.requireAccount(userId);
    const teams = await this.teamService.mine(accountId);
    return {
      teams: teams.map((t) => ({
        name: t.name,
        tag: t.tag,
        community: t.community.name,
        joinCode: t.joinCode,
        captain: t.captain,
        members: t.members.map((m) => ({
          name: m.character?.name ?? '—',
          level: m.character?.level ?? 0,
          classId: m.character?.classId ?? null,
        })),
      })),
      url: `${this.env.WEB_ORIGIN}/crew/team`,
    };
  }

  /**
   * Team-Herausforderung über Discord: eigenes (erstes) Team gegen ein Team per Kürzel. Die
   * Aufstellung ist die gespeicherte Standard-Aufstellung, sonst die ersten Mitglieder mit
   * Charakter.
   */
  async teamChallenge(input: {
    userId: string;
    opponentTag: string;
    size: 2 | 3;
    mode: 'rated' | 'friendly';
  }): Promise<DiscordTeamFightSummary> {
    const accountId = await this.requireAccount(input.userId);
    const own = (await this.teamService.mine(accountId))[0];
    if (!own) throw new ApiError(HttpStatus.NOT_FOUND, 'no_team', 'Du bist in keinem Team');
    const tag = input.opponentTag.trim().toUpperCase();
    const opponent = (await this.teamService.search(tag)).find(
      (t) => t.tag.toUpperCase() === tag && t.id !== own.id,
    );
    if (!opponent)
      throw new ApiError(HttpStatus.NOT_FOUND, 'team_not_found', 'Gegner-Team nicht gefunden');
    const saved = input.size === 2 ? own.lineup2 : own.lineup3;
    const withCharacter = own.members.filter((m) => m.character).map((m) => m.accountId);
    const lineup =
      saved.length === input.size && saved.every((id) => withCharacter.includes(id))
        ? saved
        : withCharacter.slice(0, input.size);
    const result = await this.teamService.challenge(accountId, own.id, {
      opponentTeamId: opponent.id,
      size: input.size,
      lineup,
      mode: input.mode,
    });
    return {
      ownTag: own.tag,
      opponentTag: opponent.tag,
      size: input.size,
      won: result.won,
      draw: result.draw,
      rewards: result.rewards.map((r) => ({ name: r.name, xp: r.xp, credits: r.credits })),
      replayUrl: `${this.env.WEB_ORIGIN}/replay/${result.fightId}`,
    };
  }

  /**
   * Richtet den Server als Community ein. Wer das tut (Discord-Recht „Server verwalten“), wird
   * Community-Admin – auch ohne Charakter, über einen Schatten-Account.
   */
  async setup(
    guildId: string,
    guildName: string,
    admin?: { userId: string; displayName: string },
  ): Promise<GuildCommunity> {
    const guild = await this.discord.ensureGuildCommunity(guildId, guildName);
    if (admin) {
      const accountId = await this.account(admin.userId, admin.displayName);
      await this.discord.ensureMember(guild.communityId, accountId);
      await this.discord.setRole(guild.communityId, accountId, 'admin');
    }
    return guild;
  }

  async setChannelXp(
    guildId: string,
    channelId: string,
    enabled: boolean,
  ): Promise<GuildCommunity> {
    await this.guild(guildId);
    await this.discord.setChannelXp(guildId, channelId, enabled);
    return (await this.discord.communityForGuild(guildId))!;
  }

  /** Legt Schatten-Account und Charakter an; ein späterer Web-Login übernimmt den Account. */
  async register(input: {
    guildId: string;
    userId: string;
    displayName: string;
    name: string;
    classId: ClassId;
  }) {
    const guild = await this.guild(input.guildId);
    const accountId = await this.account(input.userId, input.displayName);
    await this.discord.ensureMember(guild.communityId, accountId);
    return this.characterService.create(accountId, { name: input.name, classId: input.classId });
  }

  async profile(userId: string): Promise<DiscordProfileView> {
    const accountId = await this.requireAccount(userId);
    const c = await this.characterService.get(accountId);
    return {
      name: c.name,
      classId: c.classId,
      level: c.level,
      xp: c.xpIntoLevel,
      xpToNext: c.xpToNext,
      credits: c.credits,
      url: `${this.env.WEB_ORIGIN}/character`,
    };
  }

  async challenge(input: {
    userId: string;
    displayName: string;
    opponentUserId: string;
    mode: 'rated' | 'friendly';
  }): Promise<DiscordFightSummary> {
    const accountId = await this.requireAccount(input.userId);
    const opponentAccount = await this.accounts.findAccountId('discord', input.opponentUserId);
    const season = await this.seasons.current();
    const opponent =
      opponentAccount && (await this.characters.findForAccount(opponentAccount, season.id));
    if (!opponent)
      throw new ApiError(
        HttpStatus.NOT_FOUND,
        'opponent_not_found',
        'Gegner ist nicht registriert',
      );

    const result = await this.fights.challenge(accountId, {
      opponentId: opponent.id,
      mode: input.mode,
    });
    return this.summarize(result);
  }

  /** Kurzfassung eines Kampfes für eine Discord-Nachricht. */
  private async summarize(result: ChallengeResponse): Promise<DiscordFightSummary> {
    const fight = await this.fights.get(result.fightId);
    const names = new Map(fight.teams.flat().map((c) => [c.id, c.name]));
    let bestHit: DiscordFightSummary['bestHit'] = null;
    for (const e of fight.events) {
      if (e.type === 'damage' && !e.dot && (!bestHit || e.value > bestHit.value)) {
        bestHit = { name: names.get(e.source) ?? e.source, value: e.value };
      }
    }
    return {
      winner:
        fight.winner === null
          ? null
          : (fight.teams[fight.winner]?.map((c) => c.name).join(', ') ?? null),
      rounds: fight.rounds,
      bestHit,
      xp: result.reward.xp,
      credits: result.reward.credits,
      limit: result.reward.limit,
      levelUp: result.level.after > result.level.before ? result.level.after : null,
      url: `${this.env.WEB_ORIGIN}/replay/${result.fightId}`,
    };
  }

  // --- Liga -------------------------------------------------------------------

  /** Liga über Discord: eigener Stand, An-/Abmelden oder Platzierungskampf. */
  async leagueAction(input: {
    userId: string;
    action: 'status' | 'join' | 'leave' | 'placement';
  }): Promise<DiscordLeagueView> {
    const accountId = await this.requireAccount(input.userId);
    let fight: DiscordFightSummary | null = null;
    if (input.action === 'join' || input.action === 'leave')
      await this.league.join(accountId, input.action === 'join');
    if (input.action === 'placement')
      fight = await this.summarize(await this.league.placement(accountId));
    const v = await this.league.view(accountId);
    const mine = v.division?.table.find((r) => r.me);
    return {
      rating: v.rating?.rating ?? null,
      games: v.rating?.games ?? 0,
      placementLeft: v.rating?.placementLeft ?? v.rules.placementGames,
      joined: v.joined,
      division:
        v.division && mine
          ? {
              index: v.division.index + 1,
              count: v.division.count,
              place: mine.place,
              points: mine.points,
              size: v.division.table.length,
            }
          : null,
      next: v.next
        ? { matchday: v.next.matchday, playAt: v.next.playAt, locked: v.next.locked }
        : null,
      fight,
      url: `${this.env.WEB_ORIGIN}/fight/league`,
    };
  }

  async setLeagueChannel(
    guildId: string,
    channelId: string,
    enabled: boolean,
  ): Promise<GuildCommunity> {
    await this.guild(guildId);
    await this.discord.setLeagueChannel(guildId, channelId, enabled, new Date(this.clock.now()));
    return (await this.discord.communityForGuild(guildId))!;
  }

  /**
   * Neue Liga-Ankündigungen je Kanal seit der letzten Abfrage (Spielzeit). Der Bot fragt
   * regelmäßig; was hier geliefert wird, gilt als angekündigt.
   */
  async leagueNews(): Promise<DiscordLeagueNews[]> {
    const until = this.clock.now();
    const out: DiscordLeagueNews[] = [];
    for (const ch of await this.discord.leagueChannels()) {
      const items = await this.league.news(ch.communityId, ch.announcedUntil.getTime(), until);
      await this.discord.markLeagueAnnounced(ch.channelId, new Date(until));
      if (items.length)
        out.push({
          guildId: ch.guildId,
          channelId: ch.channelId,
          items,
          url: `${this.env.WEB_ORIGIN}/fight/league`,
        });
    }
    return out;
  }

  /**
   * Aktivitäts-XP für eine Discord-Nachricht. Der Bot schickt nur Länge und einen kurzlebigen
   * Hash, nie den Inhalt. Reihenfolge der Prüfungen: Ereignis doppelt, Spieler unbekannt,
   * Kanal ohne XP, zu kurz, Cooldown, Wiederholung, Tageslimit erreicht. Bestandene Nachrichten
   * werden nur vorgemerkt; der Worker bucht sie gebündelt (`flushPassive`).
   */
  async activity(input: {
    eventId: string;
    guildId: string;
    channelId: string;
    userId: string;
    displayName: string;
    length: number;
    hash: string;
  }): Promise<DiscordActivityResult> {
    const none = (reason: DiscordActivityResult['reason']): DiscordActivityResult => ({
      queued: 0,
      reason,
    });
    const rules = (await this.seasons.current()).game.passiveXp.message;

    if (!(await this.limiter.acquire(`event:discord:${input.eventId}`, 24 * 60 * 60 * 1000)))
      return none('duplicate');
    const accountId = await this.accounts.findAccountId('discord', input.userId);
    if (!accountId || (await this.accounts.status(accountId))?.banned)
      return none('not_registered');
    const guild = await this.discord.communityForGuild(input.guildId);
    if (!guild || !guild.xpChannels.includes(input.channelId)) return none('channel_disabled');
    const season = await this.seasons.current();
    const me = await this.characters.findForAccount(accountId, season.id);
    if (!me) return none('not_registered');
    if (input.length < rules.minLength) return none('too_short');

    // Cooldown und Wiederholung gelten je Identität, unabhängig von Server und Kanal.
    const previous = await this.limiter.swap(
      `xp:discord:last:${input.userId}`,
      input.hash,
      rules.repeatWindowMs,
    );
    if (previous === input.hash) return none('repeat');
    if (!(await this.limiter.acquire(`xp:discord:cooldown:${input.userId}`, rules.cooldownMs)))
      return none('cooldown');

    const day = dayKey(this.clock.now(), this.env.GAME_TIMEZONE);
    // Schon gebuchtes Tageslimit erreicht: gar nicht erst vormerken
    const raw = await this.discord.passiveRaw({ seasonId: season.id, accountId, day });
    if (raw >= passiveHardCap(season.game, me.level)) return none('daily_cap');

    await this.discord.ensureMember(guild.communityId, accountId);
    const amount = messageXp(season.game, input.length, Xoshiro128ss.fromSeed(randomUUID()));
    const entry: PassiveEntry = {
      seasonId: season.id,
      accountId,
      characterId: me.id,
      day,
      amount,
    };
    await this.limiter.enqueue(PASSIVE_QUEUE, JSON.stringify(entry));
    return { queued: amount, reason: 'queued' };
  }

  /**
   * Bucht vorgemerkte passive XP gebündelt: je Account und Tag eine Transaktion mit der Summe.
   * Die Deckelung rechnet pfadunabhängig (Gutschrift = f(neu) − f(alt)), deshalb ergibt die
   * Summe dasselbe wie einzelne Buchungen. Läuft per Worker alle 30 Sekunden.
   */
  async flushPassive(max = 2000): Promise<PassiveFlushResult> {
    const raw = await this.limiter.drain(PASSIVE_QUEUE, max);
    const bundles = new Map<string, PassiveEntry & { messages: number }>();
    for (const line of raw) {
      let entry: PassiveEntry;
      try {
        entry = JSON.parse(line) as PassiveEntry;
      } catch {
        continue;
      }
      const key = `${entry.seasonId}:${entry.accountId}:${entry.day}`;
      const bundle = bundles.get(key);
      if (bundle) {
        bundle.amount += entry.amount;
        bundle.messages += 1;
        bundle.characterId = entry.characterId;
      } else bundles.set(key, { ...entry, messages: 1 });
    }
    if (bundles.size === 0) return { entries: raw.length, bundles: 0, awarded: 0, levelUps: 0 };

    const season = await this.seasons.current();
    let awarded = 0;
    let levelUps = 0;
    for (const bundle of bundles.values()) {
      // Vormerkungen einer vergangenen Season verfallen
      if (bundle.seasonId !== season.id) continue;
      const booked = await this.discord.bookPassive(
        {
          seasonId: bundle.seasonId,
          accountId: bundle.accountId,
          characterId: bundle.characterId,
          day: bundle.day,
          messages: bundle.messages,
        },
        (state) => {
          const capped = applyPassiveCap(season.game, {
            level: state.level,
            rawToday: state.rawToday,
            amount: bundle.amount,
          });
          const xp = state.xp + capped.awarded;
          return {
            rawToday: capped.rawToday,
            awarded: capped.awarded,
            xp,
            level: Math.max(state.level, levelFromXp(season.game, xp).level),
          };
        },
      );
      awarded += booked.awarded;
      if (booked.level > booked.levelBefore) levelUps++;
    }
    return { entries: raw.length, bundles: bundles.size, awarded, levelUps };
  }

  private async guild(guildId: string): Promise<GuildCommunity> {
    const guild = await this.discord.communityForGuild(guildId);
    if (!guild)
      throw new ApiError(
        HttpStatus.NOT_FOUND,
        'guild_not_set_up',
        'Server ist keiner Community zugeordnet',
      );
    return guild;
  }

  private account(userId: string, displayName: string): Promise<string> {
    return this.accounts.loginWithIdentity(
      { provider: 'discord', providerUserId: userId, displayName, avatarUrl: null },
      null,
    );
  }

  private async requireAccount(userId: string): Promise<string> {
    const accountId = await this.accounts.findAccountId('discord', userId);
    if (!accountId)
      throw new ApiError(HttpStatus.NOT_FOUND, 'not_registered', 'Noch nicht registriert');
    return accountId;
  }
}
