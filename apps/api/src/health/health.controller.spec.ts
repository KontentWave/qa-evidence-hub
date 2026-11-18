import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { configureApp } from '../app.setup';
import { validateApiEnv } from '../config/env.validation';
import { PrismaService } from '../prisma/prisma.service';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

describe('HealthController', () => {
  let app: NestExpressApplication | undefined;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
  });

  async function createTestApp(checkReadinessImpl: () => Promise<boolean>) {
    const prismaMock: Pick<PrismaService, 'checkReadiness'> = {
      checkReadiness: vi.fn(checkReadinessImpl),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        HealthService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
      ],
    }).compile();

    const nestApp = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(
      nestApp,
      validateApiEnv({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://qaeh:synthetic@localhost:5432/qaeh',
        TRUST_PROXY: '1',
      }),
    );
    await nestApp.init();
    app = nestApp;
    return nestApp;
  }

  it('returns 200 { status: "ok" } with no-store and nosniff headers on GET /api/v1/health', async () => {
    const nestApp = await createTestApp(async () => true);

    const res = await request(nestApp.getHttpServer()).get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('returns 200 { status: "ready" } when PostgreSQL readiness check succeeds', async () => {
    const nestApp = await createTestApp(async () => true);

    const res = await request(nestApp.getHttpServer()).get('/api/v1/health/ready');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ready' });
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('returns sanitized 503 { status: "not_ready" } with no DSN, host, or stack details when DB fails', async () => {
    const nestApp = await createTestApp(async () => {
      throw new Error('connect ECONNREFUSED postgresql://qaeh:secret_pw@10.0.2.15:5432/qaeh');
    });

    const res = await request(nestApp.getHttpServer()).get('/api/v1/health/ready');

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'not_ready' });
    expect(JSON.stringify(res.body)).not.toContain('secret_pw');
    expect(JSON.stringify(res.body)).not.toContain('10.0.2.15');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('rejects undeclared query parameters with 400 JSON error without echoing raw input values', async () => {
    const nestApp = await createTestApp(async () => true);

    const res = await request(nestApp.getHttpServer()).get(
      '/api/v1/health?undeclaredField=sensitive_raw_value_123',
    );

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('BAD_REQUEST');
    expect(JSON.stringify(res.body)).not.toContain('sensitive_raw_value_123');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('returns stable non-echoing 404 JSON on unknown /api/v1/* routes', async () => {
    const nestApp = await createTestApp(async () => true);

    const res = await request(nestApp.getHttpServer()).get(
      '/api/v1/unknown-route?token=do_not_echo_999',
    );

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      code: 'NOT_FOUND',
      message: 'Requested resource was not found.',
    });
    expect(JSON.stringify(res.body)).not.toContain('do_not_echo_999');
  });
});
