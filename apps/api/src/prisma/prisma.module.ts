import { type DynamicModule, Global, Module } from '@nestjs/common';
import { API_ENV, type ApiEnv } from '../config/env.validation';
import { PrismaService } from './prisma.service';

@Global()
@Module({})
export class PrismaModule {
  public static register(env: ApiEnv): DynamicModule {
    return {
      module: PrismaModule,
      providers: [
        {
          provide: API_ENV,
          useValue: env,
        },
        PrismaService,
      ],
      exports: [API_ENV, PrismaService],
    };
  }
}
