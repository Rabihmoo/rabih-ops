import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Vitest config — limits the unit-test runner to src/**/*.test.ts(x).
// Playwright specs live in tests/e2e/ and are run by `npm run e2e` only.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['tests/**', 'node_modules/**', 'dist/**'],
    environment: 'node',
  },
});
