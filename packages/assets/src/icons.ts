/**
 * Prozedurale Item-Icons (Spezifikation, Abschnitt 18): eine Grundglyphe je Vorlage bzw.
 * Kategorie plus Leiterbahnen, die deterministisch aus der Item-ID entstehen. Dadurch sieht
 * jedes Item immer gleich aus, zwei Items derselben Vorlage aber unterschiedlich.
 *
 * Alle Pfade liegen in einer 48×48-Fläche und werden nur gestrichelt (stroke) gezeichnet.
 */

export const ICON_VIEWBOX = '0 0 48 48';

/** Grundglyphen der Startvorlagen. */
export const TEMPLATE_GLYPHS: Readonly<Record<string, string>> = {
  blade: 'M10 38 L33 15 L39 9 L37 17 L14 40 Z M12 33 L17 38 M8 40 L11 43',
  club: 'M10 40 L27 23 M23 15 L33 7 L42 16 L35 26 Z M28 12 L37 21',
  pistol: 'M7 17 H38 V24 H22 L20 35 H13 L15 24 H7 Z M38 20 H43 M26 24 L25 28 H21',
  rifle: 'M3 19 H40 V25 H28 L26 33 H21 L22 25 H14 L10 31 H4 L7 25 H3 Z M40 22 H46 M14 15 H24 V19',
  cyberdeck:
    'M7 13 H41 V35 H7 Z M11 17 H37 V25 H11 Z M11 30 H15 M19 30 H23 M27 30 H37 M15 35 V39 M33 35 V39',
  injector: 'M14 34 L30 18 L36 24 L20 40 Z M30 18 L34 14 M31 11 L37 17 M14 34 L8 40 M22 26 L26 30',
  shield: 'M24 5 L40 11 V24 C40 33 33 40 24 44 C15 40 8 33 8 24 V11 Z M24 11 V38 M14 20 H34',
  neural_interface:
    'M9 27 C9 14 17 7 24 7 C31 7 39 14 39 27 M9 27 H15 V34 H9 Z M33 27 H39 V34 H33 Z M15 17 H33 M24 7 V13',
  vest: 'M16 7 L24 13 L32 7 L40 13 V41 H8 V13 Z M24 13 V41 M13 24 H20 M28 24 H35',
  pants: 'M12 7 H36 L38 42 H28 L24 19 L20 42 H10 Z M12 13 H36',
  boots: 'M14 5 H25 V29 L39 33 V42 H14 Z M14 36 H39 M18 12 H25',
  gloves: 'M14 42 V22 L11 12 M18 22 V8 M24 22 V6 M30 22 V8 M34 25 L40 18 M14 22 H34 V36 L28 42 H14',
  implant: 'M24 5 L39 14 V34 L24 43 L9 34 V14 Z M24 15 V33 M16 19 L32 29 M32 19 L16 29',
  core_implant:
    'M24 10 A14 14 0 1 1 23.9 10 Z M24 18 A6 6 0 1 1 23.9 18 Z M24 3 V10 M24 38 V45 M3 24 H10 M38 24 H45',
};

/** Ersatzglyphen je Kategorie, z. B. für Vorlagen aus dem Item-Editor. */
export const CATEGORY_GLYPHS: Readonly<Record<string, string>> = {
  head: TEMPLATE_GLYPHS['neural_interface']!,
  torso: TEMPLATE_GLYPHS['vest']!,
  legs: TEMPLATE_GLYPHS['pants']!,
  feet: TEMPLATE_GLYPHS['boots']!,
  hands: TEMPLATE_GLYPHS['gloves']!,
  weapon_1h: TEMPLATE_GLYPHS['blade']!,
  weapon_2h: TEMPLATE_GLYPHS['rifle']!,
  shield: TEMPLATE_GLYPHS['shield']!,
  implant: TEMPLATE_GLYPHS['implant']!,
  core_implant: TEMPLATE_GLYPHS['core_implant']!,
};

/** Leere Plätze zeigen die typische Glyphe gestrichelt an. */
export const SLOT_GLYPHS: Readonly<Record<string, string>> = {
  head: TEMPLATE_GLYPHS['neural_interface']!,
  torso: TEMPLATE_GLYPHS['vest']!,
  legs: TEMPLATE_GLYPHS['pants']!,
  feet: TEMPLATE_GLYPHS['boots']!,
  hands: TEMPLATE_GLYPHS['gloves']!,
  main_hand: TEMPLATE_GLYPHS['cyberdeck']!,
  off_hand: TEMPLATE_GLYPHS['shield']!,
  implant_1: TEMPLATE_GLYPHS['implant']!,
  implant_2: TEMPLATE_GLYPHS['implant']!,
  core_implant: TEMPLATE_GLYPHS['core_implant']!,
};

/** Grundglyphe eines Items: Vorlage, sonst Kategorie, sonst ein neutrales Sechseck. */
export function itemGlyph(templateId: string, category?: string): string {
  return (
    TEMPLATE_GLYPHS[templateId] ??
    (category ? CATEGORY_GLYPHS[category] : undefined) ??
    TEMPLATE_GLYPHS['implant']!
  );
}

/** FNV-1a (32 Bit) über die UTF-16-Codeeinheiten; reicht für Icon-Varianten. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/**
 * Drei kurze Leiterbahnen mit Lötpunkt, deterministisch aus einer ID. Sie überlagern die
 * Grundglyphe schwach und machen jedes Item unverwechselbar.
 */
export function circuitTrace(id: string): string {
  let s = hash(id) || 1;
  const next = () => {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    return (s >>> 8) / 16777216;
  };
  const parts: string[] = [];
  for (let i = 0; i < 3; i++) {
    const x = 3 + Math.floor(next() * 42);
    const y = 3 + Math.floor(next() * 42);
    const h = (next() > 0.5 ? 1 : -1) * (4 + Math.floor(next() * 6));
    const v = (next() > 0.5 ? 1 : -1) * (3 + Math.floor(next() * 5));
    parts.push(`M${x} ${y} h${h} v${v} M${x + h - 1} ${y + v - 1} h2 v2 h-2 Z`);
  }
  return parts.join(' ');
}

/** Embleme der Team-Logos (48×48, nur Linien). */
export const TEAM_EMBLEMS: Readonly<Record<string, string>> = {
  wolf: 'M10 14 L16 6 L20 16 L28 16 L32 6 L38 14 L36 30 L24 42 L12 30 Z M18 24 h3 M27 24 h3 M21 34 L24 37 L27 34',
  halo: 'M10 14 A14 5 0 1 1 38 14 A14 5 0 1 1 10 14 Z M14 32 A10 10 0 1 0 34 32 A10 10 0 1 0 14 32 Z',
  skull:
    'M12 22 C12 12 18 7 24 7 C30 7 36 12 36 22 C36 28 33 31 31 32 V38 H17 V32 C15 31 12 28 12 22 Z M18 21 h4 v4 h-4 Z M26 21 h4 v4 h-4 Z M21 38 V34 M24 38 V34 M27 38 V34',
  bolt: 'M28 4 L12 26 H22 L18 44 L36 20 H26 Z',
  eye: 'M4 24 C12 12 36 12 44 24 C36 36 12 36 4 24 Z M24 18 A6 6 0 1 1 23.9 18 Z',
  blade: 'M12 40 L34 10 L38 6 L37 12 L16 42 Z M10 34 L18 40',
  chip: 'M14 14 H34 V34 H14 Z M19 19 H29 V29 H19 Z M18 8 V14 M24 8 V14 M30 8 V14 M18 34 V40 M24 34 V40 M30 34 V40 M8 18 H14 M8 24 H14 M8 30 H14 M34 18 H40 M34 24 H40 M34 30 H40',
  crown: 'M8 34 L10 14 L18 24 L24 10 L30 24 L38 14 L40 34 Z M10 40 H38',
};

const TEAM_COLORS = [
  ['#00F0FF', '#B44CFF'],
  ['#FF2A6D', '#FFB000'],
  ['#F5E400', '#FF2A6D'],
  ['#3DFFA8', '#00F0FF'],
  ['#B44CFF', '#FF2A6D'],
  ['#7DF9FF', '#3DFFA8'],
] as const;

/** Farbpaar eines Teams, deterministisch aus dem Kürzel. */
export function teamColors(tag: string): readonly [string, string] {
  return TEAM_COLORS[hash(tag.toUpperCase()) % TEAM_COLORS.length]!;
}
