import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      reporter: ['text', 'json-summary', 'lcov'],
      include: [
        'src/auth/**/*.ts',
        'src/clients/**/*.ts',
        'src/projects/**/*.ts',
        'src/sessions/**/*.ts',
        'src/evidence/**/*.ts',
        'src/findings/**/*.ts',
        'src/observations/**/*.ts',
        'src/retests/**/*.ts',
        'src/reports/**/*.ts',
      ],
      exclude: [
        'src/**/*.spec.ts',
        'src/**/*.dto.ts',
        'src/**/*.module.ts',
        'src/**/*.controller.ts',
        'src/**/*.port.ts',
        'src/**/index.ts',
      ],
    },
  },
  plugins: [
    swc.vite({
      module: { type: 'es6' },
    }),
  ],
});
