import assert from 'node:assert/strict';
import { After, Given, Then, When, World, setWorldConstructor } from '@cucumber/cucumber';
import type { IWorldOptions } from '@cucumber/cucumber';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { Response } from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { validateApiEnv } from '../src/config/env.validation';

class FoundationWorld extends World {
  app?: NestExpressApplication;
  lastResponse?: Response;

  constructor(options: IWorldOptions) {
    super(options);
  }
}

setWorldConstructor(FoundationWorld);

After(async function (this: FoundationWorld) {
  if (this.app) {
    await this.app.close();
    this.app = undefined;
  }
});

Given(
  'the NestJS API is booted with a migrated PostgreSQL database',
  async function (this: FoundationWorld) {
    assert.ok(
      process.env.DATABASE_URL,
      'DATABASE_URL must be set to an isolated migrated PostgreSQL instance',
    );

    const env = validateApiEnv({
      NODE_ENV: 'test',
      DATABASE_URL: process.env.DATABASE_URL,
      DATABASE_POOL_MAX: '5',
      POSTGRES_MAX_CONNECTIONS: '30',
      DATABASE_STATEMENT_TIMEOUT_MS: '5000',
      TRUST_PROXY: '1',
    });

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.register(env)],
    }).compile();

    const app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app, env, { mountSwaggerUi: false });
    await app.init();
    this.app = app;
  },
);

When('a client requests GET {string}', async function (this: FoundationWorld, routePath: string) {
  assert.ok(this.app, 'Expected NestJS application to be initialized before issuing request');
  this.lastResponse = await request(this.app.getHttpServer()).get(routePath);
});

Then('the response status code is {int}', function (this: FoundationWorld, expectedStatus: number) {
  assert.ok(this.lastResponse, 'Expected an HTTP response');
  assert.equal(this.lastResponse.status, expectedStatus);
});

Then('the JSON response body equals:', function (this: FoundationWorld, docString: string) {
  assert.ok(this.lastResponse, 'Expected an HTTP response');
  const expected = JSON.parse(docString) as unknown;
  assert.deepEqual(this.lastResponse.body, expected);
});

Then(
  'the response header {string} equals {string}',
  function (this: FoundationWorld, headerName: string, expectedValue: string) {
    assert.ok(this.lastResponse, 'Expected an HTTP response');
    const actual = this.lastResponse.headers[headerName.toLowerCase()];
    assert.equal(actual, expectedValue);
  },
);
