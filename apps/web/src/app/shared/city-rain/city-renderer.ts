/**
 * Ruhige Cyberpunk-Stadt im Regen als Hintergrund (Spezifikation, Abschnitt 18).
 *
 * Ebenen: Megatürme, Skyline mit Fensterreihen, senkrechte Neon-Schilder ohne Schrift,
 * abstrakte Holo-Werbeflächen, nasse Straße mit Spiegelung, Bodennebel; animiert werden
 * Positionslichter, ferne Gleiter, seltenes Flackern der Schilder und Regen, dessen Tropfen
 * sichtbar auf der Straße aufschlagen (Ring und zwei Spritzer).
 *
 * Die Stadt wird einmal je Größe in ein eigenes Canvas gezeichnet; pro Bild kommen nur
 * Lichter, Gleiter und Regen dazu. Zufall ist geseedet, damit die Skyline stabil bleibt.
 */

export type CityQuality = 'hoch' | 'mittel' | 'niedrig';

interface Sign {
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  layer: number;
  /** Millisekunden bis zum nächsten Flackern. */
  next: number;
}

interface Light {
  x: number;
  y: number;
  ph: number;
  sp: number;
}

interface City {
  canvas: HTMLCanvasElement;
  horizon: number;
  sc: number;
  signs: Sign[];
  lights: Light[];
}

interface Drop {
  x: number;
  y: number;
  z: number;
  len: number;
  v: number;
  hit: number;
}

interface Splash {
  x: number;
  y: number;
  z: number;
  age: number;
  life: number;
  r: number;
  b: { vx: number; vy: number }[];
}

interface Glider {
  x: number;
  y: number;
  v: number;
  s: number;
}

const NEON = ['#FF2A6D', '#00F0FF', '#B44CFF', '#F5E400', '#FF2A6D', '#00F0FF'];

const SETTINGS: Record<CityQuality, { density: number; dpr: number; spray: boolean; fps: number }> =
  {
    hoch: { density: 110, dpr: 1.5, spray: true, fps: 60 },
    mittel: { density: 60, dpr: 1, spray: false, fps: 30 },
    niedrig: { density: 45, dpr: 1, spray: false, fps: 0 },
  };

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const pick = <T>(list: readonly T[], r: number): T => list[Math.floor(r * list.length)]!;

function glow(g: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, color);
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr;
  g.fillRect(x - r, y - r, r * 2, r * 2);
}

interface Layer {
  minH: number;
  maxH: number;
  minW: number;
  maxW: number;
  top: string;
  col: string;
  win: number;
  winA: number;
  cell: number;
  signP: number;
  boardP: number;
  rim: number;
  haze: string | null;
}

const LAYERS: Layer[] = [
  {
    minH: 0.3,
    maxH: 0.62,
    minW: 26,
    maxW: 70,
    top: '#1a2148',
    col: '#141a3c',
    win: 0.1,
    winA: 0.3,
    cell: 5,
    signP: 0,
    boardP: 0,
    rim: 0,
    haze: 'rgba(30,22,70,0.45)',
  },
  {
    minH: 0.22,
    maxH: 0.55,
    minW: 40,
    maxW: 110,
    top: '#151a3e',
    col: '#0c1029',
    win: 0.16,
    winA: 0.55,
    cell: 7,
    signP: 0.16,
    boardP: 0.05,
    rim: 0.25,
    haze: 'rgba(24,16,56,0.35)',
  },
  {
    minH: 0.16,
    maxH: 0.48,
    minW: 70,
    maxW: 170,
    top: '#0e1128',
    col: '#070916',
    win: 0.13,
    winA: 0.75,
    cell: 9,
    signP: 0.3,
    boardP: 0.1,
    rim: 0.35,
    haze: null,
  },
  {
    minH: 0.1,
    maxH: 0.7,
    minW: 90,
    maxW: 220,
    top: '#0a0c1d',
    col: '#04050b',
    win: 0.06,
    winA: 0.85,
    cell: 11,
    signP: 0.42,
    boardP: 0.12,
    rim: 0.45,
    haze: null,
  },
];

/** Zeichnet die statische Stadt in ein eigenes Canvas. */
export function buildCity(doc: Document, w: number, h: number, seed: number): City {
  const canvas = doc.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d')!;
  const R = rng(seed * 7919 + 13);
  const horizon = Math.round(h * 0.72);
  const sc = Math.max(0.6, Math.min(1.6, w / 1440));

  const sky = g.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, '#030409');
  sky.addColorStop(0.5, '#080b1c');
  sky.addColorStop(0.85, '#141030');
  sky.addColorStop(1, '#22123a');
  g.fillStyle = sky;
  g.fillRect(0, 0, w, horizon);
  glow(g, w * 0.78, horizon * 0.95, w * 0.5, 'rgba(255,42,109,0.16)');
  glow(g, w * 0.16, horizon * 0.9, w * 0.42, 'rgba(0,240,255,0.10)');
  glow(g, w * 0.5, horizon, w * 0.6, 'rgba(180,76,255,0.10)');
  // Wolkendecke, von unten angeleuchtet
  for (let k = 0; k < 7; k++) {
    glow(
      g,
      R() * w,
      horizon * lerp(0.05, 0.35, R()),
      w * lerp(0.15, 0.3, R()),
      'rgba(60,40,110,0.10)',
    );
  }

  const signs: Sign[] = [];
  const lights: Light[] = [];

  // Megatürme ganz hinten
  for (let m = 0; m < 5; m++) {
    const mx = w * lerp(0.04, 0.96, R());
    const mw = lerp(34, 70, R()) * sc;
    const mh = horizon * lerp(0.7, 0.93, R());
    const mg = g.createLinearGradient(0, horizon - mh, 0, horizon);
    mg.addColorStop(0, '#1d2550');
    mg.addColorStop(1, '#121838');
    g.fillStyle = mg;
    g.beginPath();
    g.moveTo(mx, horizon);
    g.lineTo(mx, horizon - mh * 0.86);
    g.lineTo(mx + mw * 0.2, horizon - mh * 0.94);
    g.lineTo(mx + mw * 0.5, horizon - mh);
    g.lineTo(mx + mw * 0.8, horizon - mh * 0.94);
    g.lineTo(mx + mw, horizon - mh * 0.86);
    g.lineTo(mx + mw, horizon);
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(0,240,255,0.12)';
    g.fillRect(mx + mw * 0.48, horizon - mh * 0.98, 1.5, mh * 0.9);
    lights.push({ x: mx + mw * 0.5, y: horizon - mh - 2, ph: R() * 6.28, sp: 0.0016 });
    for (let y = horizon - mh * 0.84; y < horizon; y += 9 * sc) {
      if (R() < 0.35) {
        g.fillStyle = `rgba(160,190,255,${lerp(0.05, 0.18, R()).toFixed(2)})`;
        g.fillRect(mx + 3, y, mw - 6, 1);
      }
    }
  }
  const dusk = g.createLinearGradient(0, 0, 0, horizon);
  dusk.addColorStop(0, 'rgba(8,10,28,0.35)');
  dusk.addColorStop(1, 'rgba(34,18,58,0.55)');
  g.fillStyle = dusk;
  g.fillRect(0, 0, w, horizon);

  LAYERS.forEach((L, li) => {
    let x = -R() * 60;
    while (x < w + 40) {
      const bw = lerp(L.minW, L.maxW, R()) * sc;
      if (li === 3 && R() < 0.45) {
        x += bw * lerp(0.6, 1.6, R());
        continue;
      }
      const bh = horizon * lerp(L.minH, L.maxH, Math.pow(R(), 1.25));
      let top = horizon - bh;
      const fg = g.createLinearGradient(0, top, 0, horizon);
      fg.addColorStop(0, L.top);
      fg.addColorStop(0.35, L.col);
      fg.addColorStop(1, L.col);
      g.fillStyle = fg;
      g.fillRect(x, top, bw, bh + 2);
      g.fillStyle = L.top;
      if (R() < 0.35) {
        const tw = bw * lerp(0.3, 0.6, R());
        const th = lerp(8, 30, R()) * sc;
        g.fillRect(x + (bw - tw) / 2, top - th, tw, th);
        top -= th;
      }
      if (R() < 0.28) {
        const ax = x + bw * lerp(0.2, 0.8, R());
        const ah = lerp(14, 60, R()) * sc;
        g.strokeStyle = L.top;
        g.lineWidth = Math.max(1, 1.5 * sc);
        g.beginPath();
        g.moveTo(ax, top);
        g.lineTo(ax, top - ah);
        g.stroke();
        if (li >= 1)
          lights.push({ x: ax, y: top - ah, ph: R() * 6.28, sp: lerp(0.0012, 0.0024, R()) });
      }
      // Stockwerkslinien
      if (li >= 1 && li <= 2) {
        g.fillStyle = 'rgba(120,140,220,0.05)';
        for (let fl = horizon - bh + L.cell * 2 * sc; fl < horizon; fl += L.cell * 2 * sc) {
          g.fillRect(x, fl, bw, 1);
        }
      }
      // Kantenlicht von Neon
      if (R() < L.rim) {
        const rc = pick(NEON.slice(0, 3), R());
        const left = R() < 0.5;
        const rg = g.createLinearGradient(0, horizon - bh, 0, horizon);
        rg.addColorStop(0, rc);
        rg.addColorStop(1, 'rgba(0,0,0,0)');
        g.globalAlpha = 0.35;
        g.fillStyle = rg;
        g.fillRect(left ? x : x + bw - 1.5, horizon - bh, 1.5, bh);
        g.globalAlpha = 1;
      }
      if (li >= 1 && R() < 0.2) {
        g.save();
        g.shadowBlur = 10 * sc;
        g.shadowColor = pick(NEON.slice(0, 3), R());
        g.strokeStyle = g.shadowColor;
        g.globalAlpha = 0.55;
        g.lineWidth = 1.2;
        g.beginPath();
        g.moveTo(x, top + 1);
        g.lineTo(x + bw, top + 1);
        g.stroke();
        g.restore();
      }
      // Fenster in Reihen (Büros), nicht nur Streuung
      const cell = L.cell * sc;
      const ww = Math.max(1, cell * 0.38);
      const wh = Math.max(1, cell * 0.5);
      for (let y = top + cell; y < horizon - cell; y += cell) {
        const rowLit = R() < 0.7;
        let run = 0;
        const rcol = R() < 0.65 ? '255,176,0' : R() < 0.6 ? '0,240,255' : '210,225,255';
        for (let xx = x + cell * 0.5; xx < x + bw - cell * 0.5; xx += cell * 0.8) {
          if (run <= 0) {
            if (!rowLit || R() > L.win) continue;
            run = R() < 0.4 ? Math.floor(lerp(2, 7, R())) : 1;
          }
          run--;
          const col = R() < 0.05 ? '255,42,109' : rcol;
          g.fillStyle = `rgba(${col},${(L.winA * lerp(0.4, 1, R())).toFixed(2)})`;
          g.fillRect(xx, y, ww, wh);
        }
      }
      // Holo-Werbefläche (abstrakt, ohne Schrift)
      if (li >= 2 && bh > horizon * 0.25 && bw > 90 * sc && R() < L.boardP * 3) {
        const bwid = bw * lerp(0.5, 0.8, R());
        const bhei = bwid * lerp(0.45, 0.7, R());
        const bx = x + (bw - bwid) / 2;
        const by = horizon - bh + bh * lerp(0.08, 0.3, R());
        const c1 = pick(NEON.slice(0, 3), R());
        const c2 = pick(NEON.slice(1, 4), R());
        g.save();
        g.shadowBlur = 40 * sc;
        g.shadowColor = c1;
        g.globalAlpha = 0.5;
        const bgr = g.createLinearGradient(bx, by, bx + bwid, by + bhei);
        bgr.addColorStop(0, c1);
        bgr.addColorStop(1, c2);
        g.fillStyle = bgr;
        g.fillRect(bx, by, bwid, bhei);
        g.restore();
        g.fillStyle = 'rgba(4,5,10,0.35)';
        for (let sl = by; sl < by + bhei; sl += 3 * sc) g.fillRect(bx, sl, bwid, 1);
        g.fillStyle = 'rgba(255,255,255,0.22)';
        g.beginPath();
        g.arc(bx + bwid * 0.3, by + bhei * 0.5, bhei * 0.28, 0, 6.283);
        g.fill();
        g.fillStyle = 'rgba(255,255,255,0.15)';
        g.fillRect(bx + bwid * 0.55, by + bhei * 0.32, bwid * 0.32, bhei * 0.1);
        g.fillRect(bx + bwid * 0.55, by + bhei * 0.52, bwid * 0.22, bhei * 0.08);
        signs.push({
          x: bx,
          y: by,
          w: bwid,
          h: bhei,
          color: c1,
          layer: li,
          next: 9000 + R() * 30000,
        });
      }
      // Neon-Schilder, überwiegend senkrecht
      if (R() < L.signP) {
        const vertical = R() < 0.85;
        const color = pick(NEON, R());
        const sw = vertical ? lerp(6, 12, R()) * sc : lerp(26, 50, R()) * sc;
        const sh = vertical ? lerp(40, 120, R()) * sc : lerp(6, 9, R()) * sc;
        const sx =
          x + (vertical ? (R() < 0.5 ? -sw * 0.4 : bw - sw * 0.6) : bw * lerp(0.1, 0.4, R()));
        const sy = horizon - bh + bh * lerp(0.12, 0.55, R());
        signs.push({ x: sx, y: sy, w: sw, h: sh, color, layer: li, next: 4000 + R() * 20000 });
        g.save();
        g.shadowColor = color;
        g.fillStyle = color;
        g.shadowBlur = 34 * sc;
        g.globalAlpha = 0.45;
        g.fillRect(sx, sy, sw, sh);
        g.shadowBlur = 12 * sc;
        g.globalAlpha = 0.95;
        g.fillRect(sx, sy, sw, sh);
        g.globalAlpha = 1;
        g.shadowBlur = 0;
        g.fillStyle = 'rgba(5,6,11,0.6)';
        if (vertical) {
          for (let q = sy + 5 * sc; q < sy + sh - 6 * sc; q += lerp(7, 12, R()) * sc) {
            g.fillRect(sx + 2 * sc, q, sw - 4 * sc, lerp(2, 4, R()) * sc);
          }
        } else {
          g.fillRect(sx + 3 * sc, sy + sh * 0.35, sw - 6 * sc, sh * 0.3);
        }
        g.restore();
      }
      x += bw + (R() < 0.5 ? lerp(-10, 2, R()) : lerp(2, 18, R())) * sc;
    }
    if (L.haze) {
      const hz = g.createLinearGradient(0, horizon * 0.35, 0, horizon);
      hz.addColorStop(0, 'rgba(0,0,0,0)');
      hz.addColorStop(1, L.haze);
      g.fillStyle = hz;
      g.fillRect(0, horizon * 0.35, w, horizon * 0.65);
    }
  });

  // Nasse Straße mit Spiegelung der Skyline
  const copy = doc.createElement('canvas');
  copy.width = w;
  copy.height = horizon;
  copy.getContext('2d')!.drawImage(canvas, 0, 0, w, horizon, 0, 0, w, horizon);
  const street = g.createLinearGradient(0, horizon, 0, h);
  street.addColorStop(0, '#0d0b1d');
  street.addColorStop(1, '#040509');
  g.fillStyle = street;
  g.fillRect(0, horizon, w, h - horizon);
  g.save();
  g.globalAlpha = 0.28;
  g.filter = 'blur(2px)';
  g.setTransform(1, 0, 0, -0.42, 0, horizon * 1.42);
  g.drawImage(copy, 0, 0);
  g.restore();
  // Neon-Spiegelungen als zitternde Streifen
  for (const s of signs) {
    if (s.layer < 1) continue;
    const len = (h - horizon) * lerp(0.35, 0.9, R());
    const cx = s.x + s.w / 2;
    for (let y = horizon + 2; y < horizon + len; y += 3) {
      const t = (y - horizon) / len;
      g.fillStyle = s.color;
      g.globalAlpha = 0.16 * (1 - t);
      const jw = s.w * lerp(0.8, 1.8, R());
      g.fillRect(cx - jw / 2 + lerp(-3, 3, R()) * sc, y, jw, 2);
    }
  }
  g.globalAlpha = 1;
  // Wellen und Pfützenkanten
  for (let i = 0; i < 160; i++) {
    g.fillStyle = `rgba(4,5,10,${lerp(0.15, 0.4, R()).toFixed(2)})`;
    g.fillRect(R() * w, lerp(horizon, h, Math.pow(R(), 0.7)), lerp(20, 160, R()) * sc, 1);
  }
  // Pfützen, die Neon einfangen
  for (const s of signs) {
    if (s.layer < 2 || R() < 0.4) continue;
    const py = lerp(horizon + (h - horizon) * 0.25, h - 10, R());
    const pw = lerp(60, 200, R()) * sc;
    g.save();
    g.globalAlpha = 0.12;
    g.filter = 'blur(10px)';
    g.fillStyle = s.color;
    g.beginPath();
    g.ellipse(s.x + s.w / 2, py, pw, pw * 0.08, 0, 0, 6.283);
    g.fill();
    g.restore();
  }
  // Bodennebel und Horizontlinie
  const fog = g.createLinearGradient(0, horizon - 40 * sc, 0, horizon + 60 * sc);
  fog.addColorStop(0, 'rgba(90,70,160,0)');
  fog.addColorStop(0.5, 'rgba(90,70,160,0.16)');
  fog.addColorStop(1, 'rgba(90,70,160,0)');
  g.fillStyle = fog;
  g.fillRect(0, horizon - 40 * sc, w, 100 * sc);
  g.fillStyle = 'rgba(0,240,255,0.18)';
  g.fillRect(0, horizon, w, 1);

  return { canvas, horizon, sc, signs, lights };
}

/** Zeichnet und animiert die Stadt in einem sichtbaren Canvas. */
export class RainCity {
  private city: City | null = null;
  private drops: Drop[] = [];
  private splashes: Splash[] = [];
  private gliders: Glider[] = [];
  private raf = 0;
  private last = 0;
  private lastDrawn = 0;
  private w = 0;
  private h = 0;
  private quality: CityQuality = 'hoch';

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly seed = 7,
  ) {}

  setQuality(quality: CityQuality): void {
    const changed = quality !== this.quality;
    this.quality = quality;
    if (changed) this.resize(true);
    if (quality === 'niedrig') this.stop();
    else this.start();
  }

  resize(force = false): void {
    const view = this.canvas.ownerDocument.defaultView;
    const dpr = Math.min(view?.devicePixelRatio ?? 1, SETTINGS[this.quality].dpr);
    const w = Math.max(320, Math.round(this.canvas.clientWidth * dpr));
    const h = Math.max(320, Math.round(this.canvas.clientHeight * dpr));
    if (!force && w === this.w && h === this.h) return;
    this.w = w;
    this.h = h;
    this.canvas.width = w;
    this.canvas.height = h;
    this.city = buildCity(this.canvas.ownerDocument, w, h, this.seed);
    const count = Math.round((SETTINGS[this.quality].density * (w * h)) / (1440 * 900));
    this.drops = Array.from({ length: count }, () => this.newDrop(true));
    this.splashes = [];
    const R = rng(this.seed + 99);
    this.gliders = Array.from({ length: 4 }, () => ({
      x: R() * w,
      y: this.city!.horizon * lerp(0.18, 0.5, R()),
      v: lerp(0.008, 0.03, R()) * (R() < 0.5 ? -1 : 1) * this.city!.sc,
      s: lerp(0.6, 1.2, R()),
    }));
    this.draw(0, true);
  }

  start(): void {
    if (this.raf || this.quality === 'niedrig') return;
    const view = this.canvas.ownerDocument.defaultView;
    const loop = (t: number) => {
      const fps = SETTINGS[this.quality].fps;
      if (t - this.lastDrawn >= 1000 / fps - 2) {
        this.lastDrawn = t;
        this.draw(t, false);
      }
      this.raf = view?.requestAnimationFrame(loop) ?? 0;
    };
    this.raf = view?.requestAnimationFrame(loop) ?? 0;
  }

  stop(): void {
    if (this.raf) this.canvas.ownerDocument.defaultView?.cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.last = 0;
  }

  private newDrop(anywhere: boolean): Drop {
    const city = this.city!;
    const z = Math.pow(Math.random(), 1.6);
    return {
      x: Math.random() * (this.w + 200) - 100,
      y: anywhere ? Math.random() * this.h : -Math.random() * 80,
      z,
      len: (10 + 26 * z) * city.sc,
      v: (0.55 + 0.95 * z) * city.sc,
      hit: city.horizon + 6 + z * (this.h - city.horizon - 6),
    };
  }

  private draw(t: number, still: boolean): void {
    const city = this.city;
    const g = this.canvas.getContext('2d');
    if (!city || !g) return;
    const dt = this.last ? Math.min(50, t - this.last) : 16;
    this.last = t;
    const sc = city.sc;
    g.drawImage(city.canvas, 0, 0);

    // Flackernde Schilder, selten
    for (const s of city.signs) {
      if (!still) {
        s.next -= dt;
        if (s.next < -260) s.next = 6000 + Math.random() * 24000;
      }
      if (!still && s.next < 0 && Math.floor(t / 70) % 2 === 0) {
        g.fillStyle = 'rgba(4,5,10,0.78)';
        g.fillRect(s.x - 2, s.y - 2, s.w + 4, s.h + 4);
      }
    }
    // Positionslichter
    for (const L of city.lights) {
      const a = still ? 0.6 : 0.35 + 0.65 * Math.max(0, Math.sin(t * L.sp + L.ph));
      g.fillStyle = `rgba(255,59,59,${(a * 0.25).toFixed(3)})`;
      g.beginPath();
      g.arc(L.x, L.y, 5 * sc, 0, 6.283);
      g.fill();
      g.fillStyle = `rgba(255,90,90,${a.toFixed(3)})`;
      g.fillRect(L.x - 1, L.y - 1, 2.2, 2.2);
    }
    // Gleiter in der Ferne
    for (const car of this.gliders) {
      if (!still) {
        car.x += car.v * dt;
        if (car.x > this.w + 40) car.x = -40;
        if (car.x < -40) car.x = this.w + 40;
      }
      const dir = car.v > 0 ? 1 : -1;
      g.fillStyle = 'rgba(220,235,255,0.85)';
      g.fillRect(car.x, car.y, 2.4 * car.s, 1.4 * car.s);
      g.fillStyle = 'rgba(255,42,109,0.8)';
      g.fillRect(car.x - dir * 6 * car.s, car.y, 1.8 * car.s, 1.4 * car.s);
      const trail = g.createLinearGradient(car.x, 0, car.x - dir * 40 * car.s, 0);
      trail.addColorStop(0, 'rgba(200,220,255,0.18)');
      trail.addColorStop(1, 'rgba(200,220,255,0)');
      g.fillStyle = trail;
      g.fillRect(dir > 0 ? car.x - 40 * car.s : car.x, car.y + 0.4, 40 * car.s, 0.8);
    }
    // Regen
    const wind = 0.16;
    const spray = SETTINGS[this.quality].spray;
    g.lineCap = 'round';
    for (let d = 0; d < this.drops.length; d++) {
      const p = this.drops[d]!;
      if (!still) {
        p.y += p.v * dt;
        p.x += wind * p.v * dt;
      }
      if (p.y >= p.hit) {
        if (this.splashes.length < 260) {
          this.splashes.push({
            x: p.x,
            y: p.hit,
            z: p.z,
            age: 0,
            life: 420 + 320 * p.z,
            r: (4 + 15 * p.z) * sc,
            b: [
              { vx: -0.03 - Math.random() * 0.05, vy: -0.09 - 0.07 * p.z },
              { vx: 0.03 + Math.random() * 0.05, vy: -0.08 - 0.08 * p.z },
            ],
          });
        }
        this.drops[d] = this.newDrop(false);
        continue;
      }
      g.strokeStyle = `rgba(175,205,255,${(0.07 + 0.32 * p.z).toFixed(3)})`;
      g.lineWidth = (0.5 + 0.9 * p.z) * sc;
      g.beginPath();
      g.moveTo(p.x, p.y);
      g.lineTo(p.x - wind * p.len, p.y - p.len);
      g.stroke();
    }
    // Aufschläge: Ring auf der nassen Straße und zwei Spritzer
    for (let k = this.splashes.length - 1; k >= 0; k--) {
      const s = this.splashes[k]!;
      s.age += dt;
      const q = s.age / s.life;
      if (q >= 1) {
        this.splashes.splice(k, 1);
        continue;
      }
      const rr = s.r * (0.25 + q);
      const alpha = (1 - q) * (0.35 + 0.5 * s.z);
      g.strokeStyle = `rgba(190,225,255,${alpha.toFixed(3)})`;
      g.lineWidth = Math.max(0.6, (0.6 + s.z) * sc * (1 - q * 0.5));
      g.beginPath();
      g.ellipse(s.x, s.y, rr, rr * 0.26, 0, 0, 6.283);
      g.stroke();
      if (q > 0.2) {
        g.strokeStyle = `rgba(0,240,255,${(alpha * 0.45).toFixed(3)})`;
        g.beginPath();
        g.ellipse(s.x, s.y, rr * 0.55, rr * 0.14, 0, 0, 6.283);
        g.stroke();
      }
      if (spray && q < 0.55) {
        for (const b of s.b) {
          const bx = s.x + b.vx * s.age * sc * (1 + s.z);
          const by = s.y + (b.vy * s.age + 0.00045 * s.age * s.age) * sc * (1 + s.z);
          if (by <= s.y) {
            g.fillStyle = `rgba(210,235,255,${(alpha * 1.4).toFixed(3)})`;
            g.fillRect(bx, by, (1.2 + s.z) * sc, (1.2 + s.z) * sc);
          }
        }
      }
    }
  }
}
