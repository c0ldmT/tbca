import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { EQUIP_SLOTS } from '@tbca/game-core';

import { EQUIP_SLOT_VALUES, MIGRATIONS_FOLDER } from '../src/index.js';

describe('Migrationen', () => {
  it('liegen im erwarteten Ordner und sind im Journal erfasst', () => {
    const journal = JSON.parse(
      readFileSync(join(MIGRATIONS_FOLDER, 'meta', '_journal.json'), 'utf8'),
    ) as { entries: { tag: string }[] };
    expect(journal.entries.length).toBeGreaterThan(0);
    for (const { tag } of journal.entries) {
      expect(existsSync(join(MIGRATIONS_FOLDER, `${tag}.sql`))).toBe(true);
    }
  });

  it('kennt dieselben Ausrüstungsplätze wie game-core', () => {
    expect([...EQUIP_SLOT_VALUES]).toEqual([...EQUIP_SLOTS]);
  });
});
