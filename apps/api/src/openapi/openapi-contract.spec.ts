import fs from 'node:fs/promises';
import path from 'node:path';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';
import { buildOpenApiDocument, configureApp, serializeOpenApiDocument } from '../app.setup';
import { validateApiEnv } from '../config/env.validation';

describe('OpenAPI contract and production Swagger UI boundary', () => {
  it('matches committed apps/api/openapi.json without drift and documents /api/v1/health and /api/v1/auth endpoints', async () => {
    const env = validateApiEnv({
      NODE_ENV: 'development',
      DATABASE_URL: 'postgresql://qaeh:synthetic@localhost:5432/qaeh',
      TRUST_PROXY: 'false',
      APP_ORIGIN: 'http://127.0.0.1:8080',
    });

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.register(env)],
    }).compile();

    const app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app, env, { mountSwaggerUi: false });
    const doc = buildOpenApiDocument(app);
    await app.init();

    try {
      const expectedJson = serializeOpenApiDocument(doc);
      const committedPath = path.resolve(__dirname, '../../openapi.json');
      const committedJson = await fs.readFile(committedPath, 'utf8');

      expect(committedJson).toBe(expectedJson);
      expect(Object.keys(doc.paths)).toContain('/api/v1/health');
      expect(Object.keys(doc.paths)).toContain('/api/v1/health/ready');
      expect(Object.keys(doc.paths)).toContain('/api/v1/auth/csrf');
      expect(Object.keys(doc.paths)).toContain('/api/v1/auth/login');
      expect(Object.keys(doc.paths)).toContain('/api/v1/auth/session');
      expect(Object.keys(doc.paths)).toContain('/api/v1/auth/logout');
    } finally {
      await app.close();
    }
  });

  it('does not mount Swagger UI routes when NODE_ENV=production', async () => {
    const prodEnv = validateApiEnv({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://qaeh:synthetic@localhost:5432/qaeh',
      TRUST_PROXY: 'nginx',
      APP_ORIGIN: 'https://hub.synthetic.invalid',
    });

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.register(prodEnv)],
    }).compile();

    const app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app, prodEnv);
    await app.init();

    try {
      for (const docsPath of ['/api/docs', '/api/v1/docs', '/api/docs-json']) {
        const res = await request(app.getHttpServer()).get(docsPath);
        expect(res.status).toBe(404);
      }
    } finally {
      await app.close();
    }
  });
});
