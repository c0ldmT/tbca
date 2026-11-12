/**
 * Prozedurale Klang-Engine (Web Audio, ohne Audiodateien): Klangrezepte, Master-Kette mit
 * Hall und das Planen einzelner Stimmen. Ohne Angular, damit sie sich auch offline rendern
 * und testen lässt.
 */

export type SoundId =
  | 'press'
  | 'click'
  | 'toggle'
  | 'select'
  | 'tab'
  | 'nav'
  | 'open'
  | 'close'
  | 'equip'
  | 'unequip'
  | 'success'
  | 'fail'
  | 'hit'
  | 'crit'
  | 'drop';

/** Eine Stimme: Oszillator oder Rauschen mit Hüllkurve, optionalem Filter, Stereo und Hall. */
export interface Voice {
  /** Wellenform; 'noise' ist weißes Rauschen. */
  wave: OscillatorType | 'noise';
  /** Start- und Endfrequenz (Hz); bei Rauschen ohne Bedeutung. */
  from: number;
  to: number;
  /** Dauer in Sekunden. */
  len: number;
  /** Spitzenpegel (0–1, vor dem Master). */
  vol: number;
  delay?: number;
  /** Einschwingzeit in Sekunden (Standard 5 ms). */
  attack?: number;
  /** Zweite, um so viele Cent verstimmte Stimme – macht den Klang breiter und weicher. */
  detune?: number;
  /** Filter mit Frequenzfahrt, z. B. für Rausch-Wischer. */
  filter?: { type: BiquadFilterType; from: number; to: number; q?: number };
  /** Stereoposition −1 … 1. */
  pan?: number;
  /** Anteil in den Hall (0–1). */
  send?: number;
}

/**
 * Klangrezepte. Die UI-Klänge sind bewusst leise und kurz: gläserne Ticks, weiche
 * Rausch-Wischer und ein gedämpfter Akkord für den Hub-Wechsel.
 */
export const RECIPES: Record<Exclude<SoundId, 'drop' | 'click'>, Voice[]> = {
  // Gläserner Tick beim Drücken
  press: [
    { wave: 'sine', from: 2350, to: 1700, len: 0.045, vol: 0.05, send: 0.25, pan: 0.05 },
    { wave: 'triangle', from: 620, to: 540, len: 0.05, vol: 0.035, attack: 0.002 },
  ],
  // Umschalter: zwei kurze Töne aufwärts
  toggle: [
    { wave: 'sine', from: 1180, to: 1180, len: 0.05, vol: 0.045, send: 0.3, pan: -0.15 },
    {
      wave: 'sine',
      from: 1770,
      to: 1770,
      len: 0.07,
      vol: 0.04,
      delay: 0.045,
      send: 0.35,
      pan: 0.15,
    },
  ],
  // Auswahl (Klasse, Item, Tab-Inhalt): weicher Ping mit Schwebung
  select: [
    { wave: 'sine', from: 1480, to: 1520, len: 0.16, vol: 0.045, detune: 9, send: 0.45 },
    { wave: 'triangle', from: 740, to: 760, len: 0.08, vol: 0.025 },
  ],
  // Tab-Wechsel: gefilterter Luftzug und ein heller Ping
  tab: [
    {
      wave: 'noise',
      from: 0,
      to: 0,
      len: 0.16,
      vol: 0.05,
      attack: 0.03,
      filter: { type: 'bandpass', from: 900, to: 4200, q: 1.4 },
      send: 0.3,
    },
    {
      wave: 'sine',
      from: 1320,
      to: 1360,
      len: 0.18,
      vol: 0.035,
      delay: 0.05,
      detune: 7,
      send: 0.5,
    },
  ],
  // Hub-Wechsel: aufsteigender Holo-Wischer, tiefer Gleiter und ein gedämpfter Akkord
  nav: [
    {
      wave: 'noise',
      from: 0,
      to: 0,
      len: 0.34,
      vol: 0.06,
      attack: 0.08,
      filter: { type: 'bandpass', from: 380, to: 5200, q: 2.2 },
      send: 0.45,
    },
    { wave: 'sine', from: 110, to: 165, len: 0.3, vol: 0.06, attack: 0.04 },
    {
      wave: 'triangle',
      from: 440,
      to: 440,
      len: 0.42,
      vol: 0.022,
      delay: 0.1,
      attack: 0.06,
      detune: 8,
      send: 0.6,
      pan: -0.3,
    },
    {
      wave: 'triangle',
      from: 660,
      to: 660,
      len: 0.42,
      vol: 0.02,
      delay: 0.13,
      attack: 0.06,
      detune: 8,
      send: 0.6,
      pan: 0.3,
    },
    {
      wave: 'sine',
      from: 1320,
      to: 1320,
      len: 0.32,
      vol: 0.016,
      delay: 0.17,
      attack: 0.04,
      send: 0.7,
    },
  ],
  open: [
    { wave: 'sine', from: 520, to: 1040, len: 0.12, vol: 0.045, attack: 0.01, send: 0.35 },
    {
      wave: 'noise',
      from: 0,
      to: 0,
      len: 0.1,
      vol: 0.025,
      filter: { type: 'highpass', from: 2500, to: 6000 },
      send: 0.2,
    },
  ],
  close: [{ wave: 'sine', from: 980, to: 470, len: 0.12, vol: 0.04, attack: 0.005, send: 0.3 }],
  equip: [
    {
      wave: 'triangle',
      from: 300,
      to: 620,
      len: 0.1,
      vol: 0.09,
      filter: { type: 'lowpass', from: 1200, to: 4200 },
    },
    { wave: 'sine', from: 1240, to: 1240, len: 0.18, vol: 0.04, delay: 0.07, detune: 6, send: 0.5 },
    {
      wave: 'noise',
      from: 0,
      to: 0,
      len: 0.05,
      vol: 0.03,
      delay: 0.06,
      filter: { type: 'highpass', from: 4000, to: 4000 },
    },
  ],
  unequip: [
    {
      wave: 'triangle',
      from: 620,
      to: 260,
      len: 0.13,
      vol: 0.07,
      filter: { type: 'lowpass', from: 3000, to: 900 },
      send: 0.25,
    },
  ],
  success: [
    { wave: 'triangle', from: 523, to: 523, len: 0.12, vol: 0.06, send: 0.4, pan: -0.2 },
    { wave: 'triangle', from: 784, to: 784, len: 0.12, vol: 0.06, delay: 0.08, send: 0.4 },
    {
      wave: 'sine',
      from: 1046,
      to: 1046,
      len: 0.4,
      vol: 0.06,
      delay: 0.16,
      detune: 8,
      send: 0.6,
      pan: 0.2,
    },
  ],
  fail: [
    {
      wave: 'sawtooth',
      from: 260,
      to: 90,
      len: 0.34,
      vol: 0.06,
      filter: { type: 'lowpass', from: 1800, to: 300, q: 3 },
      send: 0.2,
    },
    {
      wave: 'noise',
      from: 0,
      to: 0,
      len: 0.14,
      vol: 0.035,
      filter: { type: 'lowpass', from: 1200, to: 400 },
    },
  ],
  hit: [
    {
      wave: 'noise',
      from: 0,
      to: 0,
      len: 0.08,
      vol: 0.07,
      filter: { type: 'lowpass', from: 2600, to: 600 },
    },
    { wave: 'sine', from: 170, to: 55, len: 0.12, vol: 0.09 },
  ],
  crit: [
    {
      wave: 'noise',
      from: 0,
      to: 0,
      len: 0.14,
      vol: 0.08,
      filter: { type: 'bandpass', from: 4000, to: 900, q: 1.2 },
      send: 0.3,
    },
    {
      wave: 'sawtooth',
      from: 880,
      to: 140,
      len: 0.22,
      vol: 0.05,
      filter: { type: 'lowpass', from: 5000, to: 600 },
    },
    { wave: 'sine', from: 120, to: 45, len: 0.18, vol: 0.09 },
  ],
};

/** Drop-Klang je Tier: höher und reicher, ab Tier 6 ein voller Akkord mit Hall. */
export function dropRecipe(tier: number): Voice[] {
  const base = 330 * 2 ** ((tier - 1) / 4);
  const voices: Voice[] = [
    { wave: 'triangle', from: base, to: base * 1.5, len: 0.14, vol: 0.08, send: 0.3 },
  ];
  if (tier >= 3) {
    voices.push({
      wave: 'sine',
      from: base * 2,
      to: base * 2,
      len: 0.3,
      vol: 0.05,
      delay: 0.08,
      detune: 7,
      send: 0.5,
    });
  }
  if (tier >= 5) {
    voices.push({
      wave: 'noise',
      from: 0,
      to: 0,
      len: 0.3,
      vol: 0.03,
      delay: 0.1,
      attack: 0.08,
      filter: { type: 'bandpass', from: 2000, to: 7000, q: 2 },
      send: 0.6,
    });
  }
  if (tier >= 6) {
    for (const [i, f] of [1, 1.25, 1.5, 2].entries()) {
      voices.push({
        wave: 'triangle',
        from: base * f * 2,
        to: base * f * 2,
        len: 0.9,
        vol: 0.035,
        delay: 0.24 + i * 0.06,
        attack: 0.03,
        detune: 6,
        pan: -0.45 + i * 0.3,
        send: 0.75,
      });
    }
  }
  return voices;
}

/** Eingänge der Master-Kette: trocken und Hall-Send. */
export interface SoundBus {
  master: AudioNode;
  reverb: AudioNode;
}

/**
 * Master-Kette: Tiefpass gegen Schärfe, Kompressor gegen Spitzen, Hall als Send. Funktioniert
 * mit jedem BaseAudioContext, also auch offline (Hörproben, Tests).
 */
export function createBus(ctx: BaseAudioContext): SoundBus {
  const gain = ctx.createGain();
  gain.gain.value = 1.4;
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = 9000;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -20;
  comp.knee.value = 18;
  comp.ratio.value = 4;
  comp.attack.value = 0.003;
  comp.release.value = 0.18;
  gain.connect(tone).connect(comp).connect(ctx.destination);

  const convolver = ctx.createConvolver();
  convolver.buffer = impulse(ctx, 1.8, 3.2);
  const wet = ctx.createGain();
  wet.gain.value = 0.32;
  const damp = ctx.createBiquadFilter();
  damp.type = 'lowpass';
  damp.frequency.value = 4500;
  convolver.connect(damp).connect(wet).connect(gain);
  return { master: gain, reverb: convolver };
}

/** Stereo-Impulsantwort: abklingendes Rauschen mit leicht verschiedenen Kanälen. */
function impulse(ctx: BaseAudioContext, seconds: number, decay: number): AudioBuffer {
  const length = Math.ceil(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** decay;
  }
  return buffer;
}

/** Plant eine Stimme zum Zeitpunkt start (Sekunden im Kontext). */
export function scheduleVoice(ctx: BaseAudioContext, bus: SoundBus, v: Voice, start: number): void {
  const attack = v.attack ?? 0.005;
  const end = start + v.len;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(v.vol, start + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, end);

  let out: AudioNode = env;
  if (v.filter) {
    const f = ctx.createBiquadFilter();
    f.type = v.filter.type;
    f.Q.value = v.filter.q ?? 0.8;
    f.frequency.setValueAtTime(v.filter.from, start);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, v.filter.to), end);
    env.connect(f);
    out = f;
  }
  if (v.pan && typeof ctx.createStereoPanner === 'function') {
    const p = ctx.createStereoPanner();
    p.pan.value = v.pan;
    out.connect(p);
    out = p;
  }
  out.connect(bus.master);
  if (v.send) {
    const send = ctx.createGain();
    send.gain.value = v.send;
    out.connect(send).connect(bus.reverb);
  }

  const sources: AudioScheduledSourceNode[] = [];
  if (v.wave === 'noise') {
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * v.len), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    sources.push(noise);
  } else {
    // Verstimmte Stimmen teilen sich den Pegel, damit es breiter, aber nicht lauter klingt
    const cents = v.detune ? [-v.detune / 2, v.detune / 2] : [0];
    const share = ctx.createGain();
    share.gain.value = 1 / Math.sqrt(cents.length);
    share.connect(env);
    for (const c of cents) {
      const osc = ctx.createOscillator();
      osc.type = v.wave;
      osc.detune.value = c;
      osc.frequency.setValueAtTime(v.from, start);
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, v.to), end);
      osc.connect(share);
      sources.push(osc);
    }
  }
  for (const src of sources) {
    if (v.wave === 'noise') src.connect(env);
    src.start(start);
    src.stop(end + 0.03);
  }
}
