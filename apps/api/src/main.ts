import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { validateApiEnv } from './config/env.validation';
import { PrismaService } from './prisma/prisma.service';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const env = validateApiEnv(process.env);

  const app = await NestFactory.create<NestExpressApplication>(AppModule.register(env), {
    logger: env.nodeEnv === 'production' ? ['error', 'warn', 'log'] : ['error', 'warn', 'log', 'debug'],
  });

  configureApp(app, env);
  const prismaService = app.get(PrismaService);
  prismaService.enableShutdownHooks(app);

  let shuttingDown = false;
  const handleSignal = (signal: NodeJS.Signals) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.log(`Received ${signal}; shutting down HTTP listener and database pool gracefully.`);
  };

  process.once('SIGTERM', handleSignal);
  process.once('SIGINT', handleSignal);

  await app.listen(env.apiPort, '0.0.0.0');
  logger.log(`QA Evidence Hub API listening on port ${env.apiPort} (${env.nodeEnv})`);
}

void bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown bootstrap failure';
  process.stderr.write(`Fatal API startup error: ${message}\n`);
  process.exit(1);
});
