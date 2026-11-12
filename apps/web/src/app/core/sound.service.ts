import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';

import { PreferencesService } from './preferences.service';
import {
  RECIPES,
  createBus,
  dropRecipe,
  scheduleVoice,
  type SoundBus,
  type SoundId,
} from './sound-engine';

export type { SoundId } from './sound-engine';

/** Klänge derselben Familie innerhalb dieses Abstands (ms) werden nur einmal gespielt. */
const UI_FAMILY: ReadonlySet<SoundId> = new Set(['press', 'click', 'toggle', 'select']);
const DEDUPE_MS = 90;

/**
 * Prozedurale UI-Klänge über die Web-Audio-API, ohne Audiodateien. Alle Stimmen laufen über
 * einen Master mit sanftem Tiefpass und Kompressor; ein Teil geht in einen Hall, dessen
 * Impulsantwort beim Start einmal berechnet wird. Spielt nur, wenn Sound an ist; der
 * AudioContext entsteht erst bei der ersten Aktion des Nutzers.
 */
@Injectable({ providedIn: 'root' })
export class SoundService {
  private readonly prefs = inject(PreferencesService);
  private readonly window = inject(DOCUMENT).defaultView as
    | (Window & { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
    | null;
  private context: AudioContext | null = null;
  private bus: SoundBus | null = null;
  private lastUi = -Infinity;

  play(id: SoundId, tier = 1): void {
    if (!this.prefs.sound()) return;
    const now = this.window?.performance.now() ?? 0;
    if (UI_FAMILY.has(id)) {
      if (now - this.lastUi < DEDUPE_MS) return;
      this.lastUi = now;
    }
    const ctx = this.audio();
    if (!ctx || !this.bus) return;
    const voices =
      id === 'drop'
        ? dropRecipe(Math.max(1, Math.min(6, tier)))
        : RECIPES[id === 'click' ? 'press' : id];
    const start = ctx.currentTime + 0.005;
    for (const voice of voices) scheduleVoice(ctx, this.bus, voice, start + (voice.delay ?? 0));
  }

  private audio(): AudioContext | null {
    if (this.context) {
      if (this.context.state === 'suspended') void this.context.resume().catch(() => undefined);
      return this.context;
    }
    const Ctor = this.window?.AudioContext ?? this.window?.webkitAudioContext;
    if (!Ctor) return null;
    try {
      this.context = new Ctor();
    } catch {
      return null;
    }
    this.bus = createBus(this.context);
    return this.context;
  }
}
