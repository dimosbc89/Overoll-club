import { defineConfig } from 'vitest/config';

// Reuses the throwaway Postgres of packages/server (same migrations, same fixtures).
export default defineConfig({
  test: {
    globalSetup: ['../server/test/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
