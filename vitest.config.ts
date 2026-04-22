import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Explicit exclude so the locally-cloned upstream reference/ dir never
    // gets picked up even if someone widens `include` later.
    exclude: ['**/node_modules/**', '**/dist/**', 'reference/**'],
    testTimeout: 30_000,
  },
});
