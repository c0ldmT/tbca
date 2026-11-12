import { Body, Controller, Get, HttpCode, Inject, Post, Query, UseGuards } from '@nestjs/common';
import {
  discordActivitySchema,
  discordChallengeSchema,
  discordChannelXpSchema,
  discordRegisterSchema,
  discordSetupSchema,
} from '@tbca/shared';

import { ApiError, parseBody } from '../common/api-error.js';
import { DiscordService } from './discord.service.js';
import { ServiceTokenGuard } from './service-token.guard.js';

/** Interne Endpunkte für den Discord-Bot; nur mit Service-Token erreichbar. */
@Controller('internal/discord')
@UseGuards(ServiceTokenGuard)
export class DiscordController {
  constructor(@Inject(DiscordService) private readonly discord: DiscordService) {}

  @Post('setup')
  @HttpCode(200)
  setup(@Body() body: unknown) {
    const { guildId, guildName, userId, displayName } = parseBody(discordSetupSchema, body);
    return this.discord.setup(
      guildId,
      guildName,
      userId && displayName ? { userId, displayName } : undefined,
    );
  }

  @Post('channel-xp')
  @HttpCode(200)
  channelXp(@Body() body: unknown) {
    const { guildId, channelId, enabled } = parseBody(discordChannelXpSchema, body);
    return this.discord.setChannelXp(guildId, channelId, enabled);
  }

  @Post('register')
  @HttpCode(201)
  register(@Body() body: unknown) {
    return this.discord.register(parseBody(discordRegisterSchema, body));
  }

  @Get('profile')
  profile(@Query('userId') userId: unknown) {
    if (typeof userId !== 'string' || !/^\d{5,25}$/.test(userId)) {
      throw new ApiError(400, 'invalid_request', 'userId fehlt');
    }
    return this.discord.profile(userId);
  }

  @Post('challenge')
  @HttpCode(200)
  challenge(@Body() body: unknown) {
    return this.discord.challenge(parseBody(discordChallengeSchema, body));
  }

  @Post('activity')
  @HttpCode(200)
  activity(@Body() body: unknown) {
    return this.discord.activity(parseBody(discordActivitySchema, body));
  }
}

/** Worker-Job: vorgemerkte passive XP gebündelt buchen. */
@Controller('internal/jobs')
@UseGuards(ServiceTokenGuard)
export class PassiveXpJobController {
  constructor(@Inject(DiscordService) private readonly discord: DiscordService) {}

  @Post('flush-passive-xp')
  @HttpCode(200)
  flush() {
    return this.discord.flushPassive();
  }
}
