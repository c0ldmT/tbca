/**
 * Hologramm-Silhouetten der Klassen (Paper-Doll, HUD, Klassenwahl). Fläche 200×440,
 * `body` sind gefüllte Körperflächen, `accents` Linien in der Klassenfarbe, `nodes` die
 * Knotenpunkte der zehn Ausrüstungsplätze auf dem Körper.
 *
 * Monster bekommen später dieselbe Bauweise; bis dahin zeigt das HUD eine neutrale Form.
 */

export const SILHOUETTE_VIEWBOX = '0 0 200 440';

export type SlotNode =
  | 'head'
  | 'torso'
  | 'legs'
  | 'feet'
  | 'hands'
  | 'main_hand'
  | 'off_hand'
  | 'implant_1'
  | 'implant_2'
  | 'core_implant';

export interface Silhouette {
  /** Akzentfarbe der Klasse. */
  readonly accent: string;
  readonly body: readonly string[];
  readonly accents: readonly string[];
  readonly nodes: Readonly<Record<SlotNode, readonly [number, number]>>;
}

export const CLASS_SILHOUETTES = {
  bruiser: {
    accent: '#FFB000',
    body: [
      'M28 88 Q40 66 68 76 L70 112 Q46 120 24 108 Z',
      'M172 88 Q160 66 132 76 L130 112 Q154 120 176 108 Z',
      'M100 22 C88 22 82 32 82 46 C82 60 89 69 100 69 C111 69 118 60 118 46 C118 32 112 22 100 22 Z',
      'M88 64 L112 64 L116 82 L84 82 Z',
      'M58 82 Q100 68 142 82 L154 112 L143 194 Q100 208 57 194 L46 112 Z',
      'M30 108 L60 112 L57 174 L54 222 L27 224 L25 172 Z',
      'M170 108 L140 112 L143 174 L146 222 L173 224 L175 172 Z',
      'M22 222 L59 222 L60 250 Q41 261 22 250 Z',
      'M141 222 L178 222 L178 250 Q159 261 140 250 Z',
      'M58 196 Q100 210 142 196 L146 226 L100 236 L54 226 Z',
      'M56 228 L98 238 L96 324 L94 398 L60 398 L62 324 Z',
      'M144 228 L102 238 L104 324 L106 398 L140 398 L138 324 Z',
      'M58 398 L98 398 L98 418 L48 418 Z',
      'M102 398 L142 398 L152 418 L102 418 Z',
    ],
    accents: [
      'M86 54 L114 54 L114 62 L100 71 L86 62 Z',
      'M68 114 L100 128 L132 114 M72 156 H128 M76 176 H124',
      'M30 92 Q44 80 62 84 M170 92 Q156 80 138 84',
      'M26 234 H56 M144 234 H174',
      'M56 210 H144',
    ],
    nodes: {
      head: [100, 44],
      torso: [100, 150],
      hands: [41, 240],
      legs: [79, 318],
      feet: [76, 410],
      implant_1: [116, 36],
      core_implant: [100, 120],
      implant_2: [44, 96],
      main_hand: [159, 240],
      off_hand: [42, 196],
    },
  },
  gunner: {
    accent: '#F5E400',
    body: [
      'M28 60 L38 50 L178 208 L168 218 Z',
      'M150 180 L163 168 L172 178 L159 190 Z',
      'M100 20 C88 20 80 30 80 44 C80 58 88 68 100 68 C112 68 120 58 120 44 C120 30 112 20 100 20 Z',
      'M108 22 Q132 16 136 42 Q126 34 116 36 Z',
      'M70 86 Q100 78 130 86 L144 102 L137 184 Q100 198 63 184 L56 102 Z',
      'M58 100 L44 112 L36 174 L30 234 Q34 243 42 238 L50 182 L62 130 Z',
      'M142 100 L156 112 L164 174 L170 234 Q166 243 158 238 L150 182 L138 130 Z',
      'M29 248 a7 10 0 1 0 14 0 a7 10 0 1 0 -14 0 Z',
      'M157 248 a7 10 0 1 0 14 0 a7 10 0 1 0 -14 0 Z',
      'M66 186 Q100 198 134 186 L136 214 L100 226 L64 214 Z',
      'M64 216 L98 228 L95 320 L92 400 L72 400 L73 320 Z',
      'M136 216 L102 228 L105 320 L108 400 L128 400 L127 320 Z',
      'M127 228 L141 230 L139 270 L125 268 Z',
      'M70 400 L94 400 L95 416 L62 416 Z',
      'M106 400 L130 400 L138 416 L105 416 Z',
    ],
    accents: [
      'M82 39 H97 V49 H82 Z M103 39 H118 V49 H103 Z M97 44 H103',
      'M84 88 L100 106 L116 88',
      'M62 104 L136 176 M70 112 l4 -4 M82 124 l4 -4 M94 136 l4 -4 M106 148 l4 -4 M118 160 l4 -4',
      'M178 208 L190 220',
      'M130 240 H136',
    ],
    nodes: {
      head: [100, 44],
      torso: [100, 150],
      hands: [36, 248],
      legs: [117, 318],
      feet: [82, 408],
      implant_1: [119, 34],
      core_implant: [100, 120],
      implant_2: [56, 150],
      main_hand: [164, 248],
      off_hand: [44, 222],
    },
  },
  netrunner: {
    accent: '#FF2A6D',
    body: [
      'M100 14 C84 14 76 29 77 48 C78 61 83 71 90 78 L110 78 C117 71 122 61 123 48 C124 29 116 14 100 14 Z',
      'M78 82 Q100 76 122 82 L138 98 L133 176 L144 300 L118 304 L110 238 L90 238 L82 304 L56 300 L67 176 L62 98 Z',
      'M62 98 L48 110 L41 172 L36 232 Q40 241 47 236 L54 180 L66 128 Z',
      'M138 98 L152 110 L159 172 L164 232 Q160 241 153 236 L146 180 L134 128 Z',
      'M35 246 a7 10 0 1 0 14 0 a7 10 0 1 0 -14 0 Z',
      'M151 246 a7 10 0 1 0 14 0 a7 10 0 1 0 -14 0 Z',
      'M88 238 L99 240 L97 330 L95 402 L79 402 L81 330 Z',
      'M112 238 L101 240 L103 330 L105 402 L121 402 L119 330 Z',
      'M78 402 L96 402 L97 416 L70 416 Z',
      'M104 402 L122 402 L130 416 L103 416 Z',
      'M148 166 L171 161 L175 194 L152 199 Z',
    ],
    accents: [
      'M88 47 L112 47 L109 55 L91 55 Z',
      'M120 30 C142 42 152 72 140 100 M125 44 C139 58 142 80 135 100',
      'M154 171 L168 168 L171 189 L157 192 Z M157 176 H166 M158 181 H164',
      'M100 84 V238',
      'M68 184 L58 296 M132 184 L142 296',
    ],
    nodes: {
      head: [100, 44],
      torso: [100, 150],
      hands: [42, 246],
      legs: [111, 320],
      feet: [86, 410],
      implant_1: [120, 34],
      core_implant: [100, 118],
      implant_2: [56, 160],
      main_hand: [158, 246],
      off_hand: [48, 222],
    },
  },
  medtech: {
    accent: '#3DFFA8',
    body: [
      'M66 72 L134 72 L138 100 L62 100 Z',
      'M58 104 L50 106 L48 150 L58 152 Z',
      'M78 50 C78 28 88 16 100 16 C112 16 122 28 122 50 L119 68 L81 68 Z',
      'M72 88 Q100 80 128 88 L142 102 L136 184 Q100 198 64 184 L58 102 Z',
      'M60 100 L46 112 L39 174 L34 234 Q38 243 46 238 L52 182 L64 130 Z',
      'M140 100 L154 112 L161 174 L166 234 Q162 243 154 238 L148 182 L136 130 Z',
      'M33 246 a7 10 0 1 0 14 0 a7 10 0 1 0 -14 0 Z',
      'M153 246 a7 10 0 1 0 14 0 a7 10 0 1 0 -14 0 Z',
      'M66 188 Q100 200 134 188 L136 216 L100 228 L64 216 Z',
      'M65 218 L98 230 L95 322 L92 400 L73 400 L74 322 Z',
      'M135 218 L102 230 L105 322 L108 400 L127 400 L126 322 Z',
      'M72 400 L94 400 L95 416 L64 416 Z',
      'M106 400 L128 400 L136 416 L105 416 Z',
      'M150 34 L178 34 L182 42 L146 42 Z',
      'M132 196 L146 192 L150 214 L136 218 Z',
    ],
    accents: [
      'M84 36 H116 L113 52 H87 Z',
      'M142 28 H160 M166 28 H184 M151 28 V34 M175 28 V34 M164 42 V48',
      'M100 118 V138 M90 128 H110',
      'M64 108 C54 128 50 150 52 172',
      'M38 196 H52 M148 196 H162',
    ],
    nodes: {
      head: [100, 42],
      torso: [100, 150],
      hands: [40, 246],
      legs: [117, 322],
      feet: [83, 408],
      implant_1: [118, 32],
      core_implant: [100, 118],
      implant_2: [58, 160],
      main_hand: [160, 246],
      off_hand: [46, 222],
    },
  },
} as const satisfies Record<string, Silhouette>;

export type SilhouetteClass = keyof typeof CLASS_SILHOUETTES;

/**
 * Neutrale Form für Gegner ohne eigene Silhouette (Monster, Bots ohne Klasse): ein
 * schwebender Kern mit Armen. Wird durch echte Monster-Silhouetten ersetzt.
 */
export const UNKNOWN_SILHOUETTE: Silhouette = {
  accent: '#FF2A6D',
  body: [
    'M100 60 L150 100 L150 200 L100 240 L50 200 L50 100 Z',
    'M50 130 L14 170 L22 250 L36 246 L32 184 L56 160 Z',
    'M150 130 L186 170 L178 250 L164 246 L168 184 L144 160 Z',
    'M76 236 L100 252 L124 236 L116 330 L100 400 L84 330 Z',
  ],
  accents: [
    'M100 110 A40 40 0 1 1 99.9 110 Z',
    'M100 135 A15 15 0 1 1 99.9 135 Z',
    'M70 380 Q100 420 130 380',
  ],
  nodes: {
    head: [100, 80],
    torso: [100, 150],
    hands: [24, 246],
    legs: [100, 320],
    feet: [100, 396],
    implant_1: [120, 90],
    core_implant: [100, 150],
    implant_2: [80, 90],
    main_hand: [176, 246],
    off_hand: [24, 200],
  },
};

export function silhouetteFor(classId: string | null | undefined): Silhouette {
  return (
    (classId ? (CLASS_SILHOUETTES as Record<string, Silhouette>)[classId] : undefined) ??
    UNKNOWN_SILHOUETTE
  );
}
