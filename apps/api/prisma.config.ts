import { defineConfig } from 'prisma/config';

const isMigrateCommand = process.argv.some((arg) => arg === 'migrate');
const databaseUrl = process.env.DATABASE_URL?.trim();

if (isMigrateCommand && !databaseUrl) {
  throw new Error('DATABASE_URL must be set before running Prisma migrations.');
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: databaseUrl || 'postgresql://qaeh_codegen:qaeh_codegen@localhost:5432/qaeh_codegen?schema=public',
  },
});
