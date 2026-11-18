import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type {
  LivenessResponseDto,
  ReadinessOkResponseDto,
  ReadinessUnavailableResponseDto,
} from './health.dto';

export type ReadinessResult =
  | { readonly ready: true; readonly body: ReadinessOkResponseDto }
  | { readonly ready: false; readonly body: ReadinessUnavailableResponseDto };

@Injectable()
export class HealthService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  public getLiveness(): LivenessResponseDto {
    return { status: 'ok' };
  }

  public async getReadiness(): Promise<ReadinessResult> {
    try {
      const ok = await this.prisma.checkReadiness();
      if (ok) {
        return { ready: true, body: { status: 'ready' } };
      }
      return { ready: false, body: { status: 'not_ready' } };
    } catch {
      return { ready: false, body: { status: 'not_ready' } };
    }
  }
}
