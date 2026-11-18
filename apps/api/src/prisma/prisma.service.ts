import { Inject, Injectable, type INestApplication, type OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { API_ENV, type ApiEnv } from '../config/env.validation';

@Injectable()
export class PrismaService implements OnModuleDestroy {
  public readonly client: PrismaClient;
  private readonly pool: Pool;
  private readonly readinessTimeoutMs: number;
  private closed = false;

  constructor(@Inject(API_ENV) env: ApiEnv) {
    this.readinessTimeoutMs = env.databaseStatementTimeoutMs;
    this.pool = new Pool({
      connectionString: env.databaseUrl,
      max: env.databasePoolMax,
      connectionTimeoutMillis: Math.min(env.databaseStatementTimeoutMs, 3000),
      idleTimeoutMillis: 30_000,
      statement_timeout: env.databaseStatementTimeoutMs,
      query_timeout: env.databaseStatementTimeoutMs,
    });
    const adapter = new PrismaPg(this.pool);
    this.client = new PrismaClient({ adapter });
  }

  public enableShutdownHooks(app: INestApplication): void {
    app.enableShutdownHooks();
  }

  public async checkReadiness(): Promise<boolean> {
    let timeoutHandle: NodeJS.Timeout | undefined;
    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error('Database readiness probe timed out'));
        }, this.readinessTimeoutMs);
        timeoutHandle.unref?.();
      });

      await Promise.race([this.client.$queryRaw`SELECT 1`, timeoutPromise]);
      return true;
    } catch {
      return false;
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }
  }

  public async onModuleDestroy(): Promise<void> {
    if (this.closed) {
      return;
    }
    this.closed = true;
    await this.client.$disconnect().catch(() => undefined);
    await this.pool.end().catch(() => undefined);
  }
}
