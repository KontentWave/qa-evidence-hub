import { type DynamicModule, Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { ClientsModule } from './clients/clients.module';
import type { ApiEnv } from './config/env.validation';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProjectsModule } from './projects/projects.module';
import { SessionsModule } from './sessions/sessions.module';

@Module({})
export class AppModule {
  public static register(env: ApiEnv): DynamicModule {
    return {
      module: AppModule,
      imports: [
        PrismaModule.register(env),
        HealthModule,
        AuthModule,
        ClientsModule,
        ProjectsModule,
        SessionsModule,
      ],
    };
  }
}
