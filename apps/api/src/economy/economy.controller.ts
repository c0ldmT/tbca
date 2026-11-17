import { Body, Controller, Get, HttpCode, Inject, Post, Req, UseGuards } from '@nestjs/common';
import {
  craftItemSchema,
  craftAffixSchema,
  shopBuySchema,
  transferRequestSchema,
  type CraftingResult,
  type ShopView,
} from '@tbca/shared';
import type { FastifyRequest } from 'fastify';

import { CsrfGuard, SessionGuard } from '../auth/guards.js';
import { parseBody } from '../common/api-error.js';
import { EconomyService } from './economy.service.js';

@Controller('crafting')
@UseGuards(SessionGuard, CsrfGuard)
export class CraftingController {
  constructor(@Inject(EconomyService) private readonly economy: EconomyService) {}

  @Post('salvage')
  @HttpCode(200)
  salvage(@Req() req: FastifyRequest, @Body() body: unknown): Promise<CraftingResult> {
    return this.economy.salvage(req.auth!.accountId, parseBody(craftItemSchema, body).itemId);
  }

  @Post('upgrade')
  @HttpCode(200)
  upgrade(@Req() req: FastifyRequest, @Body() body: unknown): Promise<CraftingResult> {
    return this.economy.upgrade(req.auth!.accountId, parseBody(craftItemSchema, body).itemId);
  }

  @Post('transfer')
  @HttpCode(200)
  transfer(@Req() req: FastifyRequest, @Body() body: unknown): Promise<CraftingResult> {
    const { targetId, donorId, stat } = parseBody(transferRequestSchema, body);
    return this.economy.transfer(req.auth!.accountId, targetId, donorId, stat);
  }

  @Post('reroll')
  @HttpCode(200)
  reroll(@Req() req: FastifyRequest, @Body() body: unknown): Promise<CraftingResult> {
    const { itemId, stat } = parseBody(craftAffixSchema, body);
    return this.economy.reroll(req.auth!.accountId, itemId, stat);
  }
}

@Controller('shop')
@UseGuards(SessionGuard, CsrfGuard)
export class ShopController {
  constructor(@Inject(EconomyService) private readonly economy: EconomyService) {}

  @Get()
  get(@Req() req: FastifyRequest): Promise<ShopView> {
    return this.economy.shop(req.auth!.accountId);
  }

  @Post('buy')
  @HttpCode(200)
  buy(@Req() req: FastifyRequest, @Body() body: unknown): Promise<ShopView> {
    return this.economy.buy(req.auth!.accountId, parseBody(shopBuySchema, body).offerId);
  }

  @Post('sell')
  @HttpCode(200)
  sell(@Req() req: FastifyRequest, @Body() body: unknown): Promise<ShopView> {
    return this.economy.sell(req.auth!.accountId, parseBody(craftItemSchema, body).itemId);
  }
}
