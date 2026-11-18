import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/coverage/**',
      'packages/api-client/src/generated/**',
      'scripts/sync-sheet-apps-script.gs',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx,mjs,cjs,js}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['apps/api/**/*.ts'],
    rules: {
      // NestJS emitDecoratorMetadata requires runtime class imports for DTOs and DI tokens.
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx,mjs,js}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@prisma/client',
              message: 'apps/web must never import database clients; call apps/api via @qa-evidence-hub/api-client.',
            },
            {
              name: '@prisma/adapter-pg',
              message: 'apps/web must never import database adapters.',
            },
            {
              name: 'prisma',
              message: 'apps/web must never import Prisma.',
            },
            {
              name: 'pg',
              message: 'apps/web must never import PostgreSQL drivers.',
            },
          ],
          patterns: [
            {
              group: ['@aws-sdk/*', '@qa-evidence-hub/api/*'],
              message: 'apps/web must not import storage SDKs or internal API implementation modules.',
            },
          ],
        },
      ],
    },
  },
);
