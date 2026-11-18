import 'reflect-metadata';
import fs from 'node:fs/promises';
import path from 'node:path';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from '../app.module';
import { buildOpenApiDocument, configureApp, serializeOpenApiDocument } from '../app.setup';
import { validateApiEnv } from '../config/env.validation';

async function exportOpenApi(): Promise<void> {
  const checkOnly = process.argv.includes('--check');
  const env = validateApiEnv({
    NODE_ENV: 'development',
    DATABASE_URL: 'postgresql://qaeh_openapi:qaeh_openapi@localhost:5432/qaeh_openapi',
    TRUST_PROXY: '1',
  });

  const app = await NestFactory.create<NestExpressApplication>(AppModule.register(env), {
    logger: false,
  });

  try {
    configureApp(app, env, { mountSwaggerUi: false });
    const document = buildOpenApiDocument(app);
    const serialized = serializeOpenApiDocument(document);
    const outputPath = path.resolve(__dirname, '../../openapi.json');

    if (checkOnly) {
      const current = await fs.readFile(outputPath, 'utf8').catch(() => '');
      if (current !== serialized) {
        process.stderr.write(
          'OpenAPI specification drift detected in apps/api/openapi.json. Run pnpm openapi:generate.\n',
        );
        process.exitCode = 1;
      }
      return;
    }

    await fs.writeFile(outputPath, serialized, 'utf8');
  } finally {
    await app.close();
  }
}

void exportOpenApi().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown OpenAPI export failure';
  process.stderr.write(`OpenAPI export error: ${message}\n`);
  process.exit(1);
});
