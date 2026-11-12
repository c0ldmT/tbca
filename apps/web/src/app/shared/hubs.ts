/** Die vier Hubs der Hauptnavigation mit Pfad, Übersetzungsschlüssel und Icon-Pfad (24er-Raster). */
export const HUBS = [
  {
    path: '/character',
    key: 'character',
    icon: 'M12 2.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7z M5 22v-4a7 7 0 0 1 14 0v4',
  },
  { path: '/fight', key: 'fight', icon: 'M4 20 L16 8 M14 4h6v6 M4 4l6 6 M14 14l6 6 M17 20l3-3' },
  {
    path: '/crew',
    key: 'crew',
    icon: 'M8 5a3 3 0 1 1 0 6 3 3 0 0 1 0-6z M17 6.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z M2 20v-2a6 6 0 0 1 12 0v2 M14 20v-1.5a4.5 4.5 0 0 1 8 0V20',
  },
  { path: '/market', key: 'market', icon: 'M3 9l2-5h14l2 5 M3 9h18v11H3z M9 13h6' },
] as const;
