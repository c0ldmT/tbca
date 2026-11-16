import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { EQUIP_SLOTS, type EquipSlot } from '@tbca/game-core';
import { equipRequestSchema, type InventoryView, type ItemView } from '@tbca/shared';
import type { FastifyRequest } from 'fastify';

import { CsrfGuard, SessionGuard } from '../auth/guards.js';
import { ApiError, parseBody } from '../common/api-error.js';
import { InventoryService } from './inventory.service.js';

function slotParam(value: string): EquipSlot {
  if (!(EQUIP_SLOTS as readonly string[]).includes(value)) {
    throw new ApiError(400, 'invalid_slot', 'Unbekannter Ausrüstungsplatz');
  }
  return value as EquipSlot;
}

@Controller('inventory')
@UseGuards(SessionGuard, CsrfGuard)
export class InventoryController {
  constructor(@Inject(InventoryService) private readonly inventory: InventoryService) {}

  @Get()
  get(@Req() req: FastifyRequest): Promise<InventoryView> {
    return this.inventory.get(req.auth!.accountId);
  }

  @Put('equipment/:slot')
  equip(
    @Req() req: FastifyRequest,
    @Param('slot') slot: string,
    @Body() body: unknown,
  ): Promise<InventoryView> {
    return this.inventory.equip(
      req.auth!.accountId,
      slotParam(slot),
      parseBody(equipRequestSchema, body).itemId,
    );
  }

  @Delete('equipment/:slot')
  unequip(@Req() req: FastifyRequest, @Param('slot') slot: string): Promise<InventoryView> {
    return this.inventory.unequip(req.auth!.accountId, slotParam(slot));
  }

  @Post('test-loot')
  @HttpCode(201)
  testLoot(@Req() req: FastifyRequest): Promise<ItemView> {
    return this.inventory.testLoot(req.auth!.accountId);
  }
}
