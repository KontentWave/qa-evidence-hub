import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  oxc: {
    jsx: 'automatic',
  },
  resolve: {
    alias: {
      '@': currentDir,
      'server-only': path.resolve(currentDir, './src/test-server-only-shim.ts'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: false,
    include: ['src/**/*.spec.{ts,tsx}'],
  },
});
