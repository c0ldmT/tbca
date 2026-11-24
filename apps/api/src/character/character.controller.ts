import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  renameSchema,
  attributesRequestSchema,
  checkName,
  classRequestSchema,
  createCharacterRequestSchema,
  loadoutRequestSchema,
  type CharacterResponse,
} from '@tbca/shared';
import type { FastifyRequest } from 'fastify';

import { CsrfGuard, SessionGuard } from '../auth/guards.js';
import { parseBody } from '../common/api-error.js';
import { CharacterService } from './character.service.js';

@Controller('characters')
@UseGuards(SessionGuard, CsrfGuard)
export class CharacterController {
  constructor(@Inject(CharacterService) private readonly characters: CharacterService) {}

  @Get('me')
  me(@Req() req: FastifyRequest): Promise<CharacterResponse> {
    return this.characters.get(req.auth!.accountId);
  }

  @Post()
  @HttpCode(201)
  create(@Req() req: FastifyRequest, @Body() body: unknown): Promise<CharacterResponse> {
    return this.characters.create(
      req.auth!.accountId,
      parseBody(createCharacterRequestSchema, body),
    );
  }

  /** Prüft Namensregeln und Verfügbarkeit, bevor der Spieler absendet. */
  @Get('name-available')
  async nameAvailable(
    @Query('name') name: unknown,
  ): Promise<{ available: boolean; problem: string | null }> {
    const value = typeof name === 'string' ? name.trim() : '';
    const problem = checkName(value);
    if (problem) return { available: false, problem };
    const available = await this.characters.isNameAvailable(value);
    return { available, problem: available ? null : 'taken' };
  }

  @Put('me/attributes')
  attributes(@Req() req: FastifyRequest, @Body() body: unknown): Promise<CharacterResponse> {
    return this.characters.setAttributes(
      req.auth!.accountId,
      parseBody(attributesRequestSchema, body),
    );
  }

  @Put('me/name')
  rename(@Req() req: FastifyRequest, @Body() body: unknown): Promise<CharacterResponse> {
    return this.characters.rename(req.auth!.accountId, parseBody(renameSchema, body).name);
  }

  @Post('me/respec')
  @HttpCode(200)
  respec(@Req() req: FastifyRequest): Promise<CharacterResponse> {
    return this.characters.respec(req.auth!.accountId);
  }

  @Put('me/class')
  switchClass(@Req() req: FastifyRequest, @Body() body: unknown): Promise<CharacterResponse> {
    return this.characters.switchClass(
      req.auth!.accountId,
      parseBody(classRequestSchema, body).classId,
    );
  }

  @Put('me/loadout')
  loadout(@Req() req: FastifyRequest, @Body() body: unknown): Promise<CharacterResponse> {
    return this.characters.setLoadout(req.auth!.accountId, parseBody(loadoutRequestSchema, body));
  }
}
