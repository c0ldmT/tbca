import { Injectable, inject, signal } from '@angular/core';
import type { DungeonView } from '@tbca/shared';

import { EconomyService } from './economy.service';

/**
 * Werte, die die Kopfleiste dauerhaft zeigt und die nicht im Charakter stecken
 * (Dungeon-Runs heute, laufender Run). Seiten melden neue Stände über `fromDungeon`.
 */
@Injectable({ providedIn: 'root' })
export class HudStatusService {
  private readonly economy = inject(EconomyService);

  readonly runs = signal<{ today: number; perDay: number } | null>(null);
  readonly runActive = signal(false);

  async refresh(): Promise<void> {
    try {
      this.fromDungeon(await this.economy.dungeon());
    } catch {
      // Kopfleiste bleibt ohne Run-Anzeige; die Dungeon-Seite zeigt Fehler selbst.
    }
  }

  fromDungeon(view: DungeonView): void {
    this.runs.set({ today: view.runsToday, perDay: view.runsPerDay });
    this.runActive.set(view.run?.status === 'active');
  }

  clear(): void {
    this.runs.set(null);
    this.runActive.set(false);
  }
}
