import {
  ATTRIBUTES,
  CLASS_IDS,
  STATUS_KINDS,
  type EquipSlot,
  type ItemData,
} from '@tbca/game-core';
import { z } from 'zod';

import { checkName, NAME_MAX_LENGTH } from './names.js';

export const classIdSchema = z.enum(CLASS_IDS);

const attributeValue = z.number().int().min(0).max(10_000);
export const attributesSchema = z.object(
  Object.fromEntries(ATTRIBUTES.map((a) => [a, attributeValue])) as Record<
    (typeof ATTRIBUTES)[number],
    typeof attributeValue
  >,
);

const permille = z.number().int().min(0).max(1000);
const statusKind = z.enum(STATUS_KINDS);

export const tacticConditionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('always') }),
  z.object({ type: z.literal('self_hp_below'), permille }),
  z.object({ type: z.literal('ally_hp_below'), permille }),
  z.object({ type: z.literal('energy_at_least'), value: z.number().int().min(0).max(1000) }),
  z.object({ type: z.literal('target_has_status'), status: statusKind }),
  z.object({ type: z.literal('target_lacks_status'), status: statusKind }),
  z.object({ type: z.literal('round_at_least'), round: z.number().int().min(1).max(1000) }),
  z.object({ type: z.literal('enemies_at_least'), count: z.number().int().min(1).max(20) }),
]);

export const targetSelectorSchema = z.enum([
  'threat',
  'lowest_hp',
  'highest_hp',
  'healer',
  'random',
  'self',
  'lowest_hp_ally',
]);

export const tacticRuleSchema = z.object({
  when: tacticConditionSchema,
  use: z.string().min(1).max(64),
  target: targetSelectorSchema.optional(),
});

/** POST /api/characters */
export const createCharacterRequestSchema = z.object({
  name: z
    .string()
    .trim()
    .max(NAME_MAX_LENGTH * 4)
    .superRefine((name, ctx) => {
      const problem = checkName(name);
      if (problem) ctx.addIssue({ code: 'custom', message: problem });
    }),
  classId: classIdSchema,
});
export type CreateCharacterRequest = z.infer<typeof createCharacterRequestSchema>;

/** PUT /api/characters/me/attributes – vollständige Verteilung der freien Punkte. */
export const attributesRequestSchema = attributesSchema;

/** PUT /api/characters/me/class */
export const classRequestSchema = z.object({ classId: classIdSchema });

/** PUT /api/characters/me/loadout */
export const loadoutRequestSchema = z.object({
  abilities: z.array(z.string().min(1).max(64)).max(8),
  tactics: z.array(tacticRuleSchema).max(12),
});
export type LoadoutRequest = z.infer<typeof loadoutRequestSchema>;

/** GET /api/characters/me */
export const characterResponseSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  classId: classIdSchema,
  level: z.number().int(),
  xp: z.number().int(),
  xpIntoLevel: z.number().int(),
  xpToNext: z.number().int().nullable(),
  season: z.object({ id: z.uuid(), name: z.string(), configVersion: z.number().int() }),
  allocated: attributesSchema,
  attributes: attributesSchema,
  unspentPoints: z.number().int(),
  /** Credits in dieser Season. */
  credits: z.number().int(),
  respecCost: z.number().int(),
  stats: z.object({
    maxHp: z.number().int(),
    armor: z.number().int(),
    firewall: z.number().int(),
    initiative: z.number().int(),
    accuracy: z.number().int(),
    evasion: z.number().int(),
    critChance: z.number().int(),
    critDamage: z.number().int(),
    energyMax: z.number().int(),
    energyRegen: z.number().int(),
    threat: z.number().int(),
  }),
  loadout: loadoutRequestSchema,
  /** Ausgerüstete Items, z. B. für die Vorschau der Kampfwerte im Browser. */
  gear: z.custom<Partial<Record<EquipSlot, ItemData>>>((v) => typeof v === 'object' && v !== null),
});
export type CharacterResponse = z.infer<typeof characterResponseSchema>;
