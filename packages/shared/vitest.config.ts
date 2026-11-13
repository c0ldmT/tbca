import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    conditions: ['@tbca/source'],
  },
  ssr: {
    resolve: {
      conditions: ['@tbca/source'],
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
  },
});
