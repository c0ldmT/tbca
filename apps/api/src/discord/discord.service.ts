import { randomUUID } from 'node:crypto';

import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  applyPassiveCap,
  levelFromXp,
  messageXp,
  Xoshiro128ss,
  type ClassId,
  type Clock,
} from '@tbca/game-core';
import type { DiscordActivityResult, DiscordFightSummary, DiscordProfileView } from '@tbca/shared';

import type { AccountRepository } from '../auth/types.js';
import { CharacterService } from '../character/character.service.js';
import type { CharacterRepository } from '../character/types.js';
import { ApiError } from '../common/api-error.js';
import type { Env } from '../config/env.js';
import { dayKey } from '../fight/day.js';
import { FightService } from '../fight/fight.service.js';
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
  ) {}

  setup(guildId: string, guildName: string): Promise<GuildCommunity> {
    return this.discord.ensureGuildCommunity(guildId, guildName);
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

  /**
   * Aktivitäts-XP für eine Discord-Nachricht. Der Bot schickt nur Länge und einen kurzlebigen
   * Hash, nie den Inhalt. Reihenfolge der Prüfungen: Ereignis doppelt, Spieler unbekannt,
   * Kanal ohne XP, zu kurz, Cooldown, Wiederholung, Tageslimit.
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
      awarded: 0,
      reason,
      levelUp: null,
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

    await this.discord.ensureMember(guild.communityId, accountId);
    const amount = messageXp(season.game, input.length, Xoshiro128ss.fromSeed(randomUUID()));
    const booked = await this.discord.bookPassive(
      {
        seasonId: season.id,
        accountId,
        characterId: me.id,
        day: dayKey(this.clock.now(), this.env.GAME_TIMEZONE),
      },
      (state) => {
        const capped = applyPassiveCap(season.game, {
          level: state.level,
          rawToday: state.rawToday,
          amount,
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
    return {
      awarded: booked.awarded,
      reason: booked.awarded > 0 ? 'ok' : 'daily_cap',
      levelUp: booked.level > booked.levelBefore ? booked.level : null,
    };
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
