import { type DynamicModule, Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import type { ApiEnv } from './config/env.validation';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({})
export class AppModule {
  public static register(env: ApiEnv): DynamicModule {
    return {
      module: AppModule,
      imports: [PrismaModule.register(env), HealthModule, AuthModule],
    };
  }
}
