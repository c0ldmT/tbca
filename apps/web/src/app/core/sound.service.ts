import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';

import { PreferencesService } from './preferences.service';

export type SoundId = 'click' | 'equip' | 'unequip' | 'success' | 'fail' | 'hit' | 'crit' | 'drop';

interface Tone {
  /** Wellenform; 'noise' ist weißes Rauschen. */
  wave: OscillatorType | 'noise';
  from: number;
  to: number;
  /** Dauer in Sekunden. */
  len: number;
  vol: number;
  delay?: number;
}

/** Klänge als kleine Rezepte aus Tönen – prozedural, ohne Audiodateien. */
const RECIPES: Record<Exclude<SoundId, 'drop'>, Tone[]> = {
  click: [{ wave: 'square', from: 1800, to: 1200, len: 0.03, vol: 0.05 }],
  equip: [
    { wave: 'triangle', from: 320, to: 640, len: 0.08, vol: 0.12 },
    { wave: 'square', from: 1300, to: 1600, len: 0.05, vol: 0.04, delay: 0.06 },
  ],
  unequip: [{ wave: 'triangle', from: 600, to: 260, len: 0.1, vol: 0.1 }],
  success: [
    { wave: 'triangle', from: 520, to: 520, len: 0.08, vol: 0.12 },
    { wave: 'triangle', from: 780, to: 780, len: 0.08, vol: 0.12, delay: 0.08 },
    { wave: 'triangle', from: 1040, to: 1180, len: 0.16, vol: 0.12, delay: 0.16 },
  ],
  fail: [
    { wave: 'sawtooth', from: 300, to: 90, len: 0.32, vol: 0.09 },
    { wave: 'noise', from: 0, to: 0, len: 0.12, vol: 0.05 },
  ],
  hit: [
    { wave: 'noise', from: 0, to: 0, len: 0.07, vol: 0.08 },
    { wave: 'square', from: 180, to: 60, len: 0.09, vol: 0.07 },
  ],
  crit: [
    { wave: 'noise', from: 0, to: 0, len: 0.12, vol: 0.1 },
    { wave: 'sawtooth', from: 900, to: 120, len: 0.2, vol: 0.08 },
  ],
};

/** Drop-Klang je Tier: höher und reicher, ab Tier 6 ein voller Akkord. */
function dropRecipe(tier: number): Tone[] {
  const base = 330 * 2 ** ((tier - 1) / 4);
  const tones: Tone[] = [{ wave: 'triangle', from: base, to: base * 1.5, len: 0.12, vol: 0.1 }];
  if (tier >= 3)
    tones.push({ wave: 'sine', from: base * 2, to: base * 2, len: 0.2, vol: 0.06, delay: 0.08 });
  if (tier >= 5)
    tones.push({ wave: 'square', from: base * 3, to: base * 4, len: 0.18, vol: 0.03, delay: 0.16 });
  if (tier >= 6) {
    for (const [i, f] of [1, 1.25, 1.5, 2].entries()) {
      tones.push({
        wave: 'triangle',
        from: base * f * 2,
        to: base * f * 2,
        len: 0.6,
        vol: 0.05,
        delay: 0.24 + i * 0.05,
      });
    }
  }
  return tones;
}

/**
 * Prozedurale UI-Klänge über die Web-Audio-API. Spielt nur, wenn Sound im Profil-Menü an
 * ist; der AudioContext entsteht erst bei der ersten Aktion des Nutzers.
 */
@Injectable({ providedIn: 'root' })
export class SoundService {
  private readonly prefs = inject(PreferencesService);
  private readonly window = inject(DOCUMENT).defaultView as
    | (Window & { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
    | null;
  private context: AudioContext | null = null;

  play(id: SoundId, tier = 1): void {
    if (!this.prefs.sound()) return;
    const ctx = this.audio();
    if (!ctx) return;
    const tones = id === 'drop' ? dropRecipe(Math.max(1, Math.min(6, tier))) : RECIPES[id];
    const now = ctx.currentTime;
    for (const tone of tones) this.tone(ctx, tone, now + (tone.delay ?? 0));
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
    return this.context;
  }

  private tone(ctx: AudioContext, t: Tone, start: number): void {
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(t.vol, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + t.len);
    gain.connect(ctx.destination);
    let source: AudioScheduledSourceNode;
    if (t.wave === 'noise') {
      const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * t.len), ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      source = noise;
    } else {
      const osc = ctx.createOscillator();
      osc.type = t.wave;
      osc.frequency.setValueAtTime(t.from, start);
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, t.to), start + t.len);
      source = osc;
    }
    source.connect(gain);
    source.start(start);
    source.stop(start + t.len + 0.02);
  }
}
