import type { GameConfig } from '../content/types.js';
import { Xoshiro128ss, type Seed } from '../random/prng.js';
import { rollItem } from './items.js';
import type { ItemData } from './types.js';

/**
 * Rarität eines Loot-Wurfs nach Gewichten (Spezifikation, Abschnitt 7). `maxRarity` begrenzt,
 * was die Quelle hergibt (z. B. Stern 10+ erst ab Dungeon-Etage 20).
 */
export function rollRarity(config: GameConfig, rng: Xoshiro128ss, maxRarity: number): number {
  const bands = config.loot.rarityBands.filter((b) => b.from <= maxRarity);
  const total = bands.reduce((sum, b) => sum + b.weight, 0);
  let pick = rng.nextInt(total);
  for (const band of bands) {
    if (pick < band.weight)
      return band.from + rng.nextInt(Math.min(band.to, maxRarity) - band.from + 1);
    pick -= band.weight;
  }
  return 1;
}

/** Ein zufälliges Item für eine Quelle: Vorlage, Rarität, Werte – alles aus einem Seed. */
export function rollLoot(
  config: GameConfig,
  input: { itemLevel: number; maxRarity: number; seed: Seed; templateIds?: readonly string[] },
): ItemData {
  const rng = Xoshiro128ss.fromSeed(input.seed);
  const ids = input.templateIds ?? config.items.templates.map((t) => t.id);
  const templateId = ids[rng.nextInt(ids.length)]!;
  const rarity = rollRarity(config, rng, input.maxRarity);
  return rollItem(config, {
    templateId,
    itemLevel: input.itemLevel,
    rarity,
    seed: rng.nextUint32(),
  });
}
