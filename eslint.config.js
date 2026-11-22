// @ts-check
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/.angular/**',
      'packages/db/drizzle/**',
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      eqeqeq: ['error', 'always'],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    // Website läuft im Browser; Tests nutzen Vitest-Globals.
    files: ['apps/web/src/**/*.ts'],
    languageOptions: { globals: { ...globals.browser, ...globals.vitest } },
  },
  {
    // Kommandozeilen-Programme dürfen auf die Konsole schreiben.
    files: [
      '**/src/cli/**/*.ts',
      'apps/bot-*/src/bot.ts',
      'apps/bot-*/src/register-commands.ts',
      'apps/server/src/**/*.ts',
      'apps/worker/src/worker.ts',
    ],
    rules: { 'no-console': 'off' },
  },
  {
    // Spiellogik muss deterministisch und frei von I/O bleiben (Spezifikation, Abschnitt 6).
    files: ['packages/game-core/src/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'Date', message: 'Zeit nur über den Clock-Service (GameClock) lesen.' },
        { name: 'performance', message: 'Keine Laufzeitmessung in der Spiellogik.' },
        { name: 'crypto', message: 'Zufall nur über Xoshiro128ss mit Seed.' },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Zufall nur über Xoshiro128ss mit Seed.' },
        ...[
          'pow',
          'exp',
          'expm1',
          'log',
          'log2',
          'log10',
          'log1p',
          'cbrt',
          'hypot',
          'sin',
          'cos',
          'tan',
          'asin',
          'acos',
          'atan',
          'atan2',
          'sinh',
          'cosh',
          'tanh',
          'asinh',
          'acosh',
          'atanh',
        ].map((property) => ({
          object: 'Math',
          property,
          message: 'Kann sich zwischen JS-Engines unterscheiden; Festkomma oder Tabellen nutzen.',
        })),
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "BinaryExpression[operator='**'], AssignmentExpression[operator='**=']",
          message: 'Potenzen wie Math.pow vermeiden; Festkomma oder Tabellen nutzen.',
        },
      ],
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['node:*'], message: 'game-core bleibt frei von Node-APIs.' }] },
      ],
    },
  },
  prettier,
);
