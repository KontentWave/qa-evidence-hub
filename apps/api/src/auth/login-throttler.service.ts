import { Inject, Injectable } from '@nestjs/common';
import { LoginThrottledException } from '../common/http-exception.filter';
import { API_ENV, type ApiEnv } from '../config/env.validation';

export type LoginAttemptSettlement = 'success' | 'invalid_credentials' | 'error';

export interface LoginAttemptReservation {
  readonly isSettled: boolean;
  settle(outcome: LoginAttemptSettlement, nowMs?: number): void;
}

interface ThrottleBucket {
  failures: number;
  inFlight: number;
  windowStartedAtMs: number;
  blockedUntilMs: number;
}

@Injectable()
export class LoginThrottlerService {
  private readonly maxAttempts: number;
  private readonly windowMs: number;
  private readonly blockMs: number;
  private readonly maxKeys: number;
  private readonly inFlightRetryAfterSeconds: number;
  private readonly buckets = new Map<string, ThrottleBucket>();

  constructor(@Inject(API_ENV) env: ApiEnv) {
    this.maxAttempts = env.loginMaxAttempts;
    this.windowMs = env.loginWindowSeconds * 1000;
    this.blockMs = env.loginBlockSeconds * 1000;
    this.maxKeys = env.loginThrottleMaxKeys;
    this.inFlightRetryAfterSeconds = Math.max(1, Math.min(5, env.loginBlockSeconds));
  }

  public reserveAttempt(rawClientIp: string, nowMs = Date.now()): LoginAttemptReservation {
    const key = this.normalizeKey(rawClientIp);
    let bucket = this.buckets.get(key);

    if (bucket) {
      if (bucket.blockedUntilMs > nowMs) {
        const retryAfterSeconds = Math.max(1, Math.ceil((bucket.blockedUntilMs - nowMs) / 1000));
        throw new LoginThrottledException(retryAfterSeconds);
      }

      const blockExpired = bucket.blockedUntilMs > 0 && bucket.blockedUntilMs <= nowMs;
      const windowExpired = nowMs - bucket.windowStartedAtMs >= this.windowMs;
      if (blockExpired || windowExpired) {
        bucket.failures = 0;
        bucket.blockedUntilMs = 0;
        bucket.windowStartedAtMs = nowMs;
      }

      if (bucket.failures + bucket.inFlight >= this.maxAttempts) {
        throw new LoginThrottledException(this.inFlightRetryAfterSeconds);
      }

      bucket.inFlight += 1;
      this.buckets.delete(key);
      this.buckets.set(key, bucket);
    } else {
      this.ensureCapacity(nowMs);
      bucket = {
        failures: 0,
        inFlight: 1,
        windowStartedAtMs: nowMs,
        blockedUntilMs: 0,
      };
      this.buckets.set(key, bucket);
    }

    const reservedBucket = bucket;
    let settled = false;

    return {
      get isSettled(): boolean {
        return settled;
      },
      settle: (outcome: LoginAttemptSettlement, settleNowMs = Date.now()): void => {
        if (settled) {
          return;
        }
        settled = true;
        this.settleBucket(key, reservedBucket, outcome, settleNowMs);
      },
    };
  }

  public getTrackedKeyCount(): number {
    return this.buckets.size;
  }

  private settleBucket(
    key: string,
    bucket: ThrottleBucket,
    outcome: LoginAttemptSettlement,
    nowMs: number,
  ): void {
    bucket.inFlight = Math.max(0, bucket.inFlight - 1);

    if (outcome === 'success') {
      bucket.failures = 0;
      bucket.blockedUntilMs = 0;
      bucket.windowStartedAtMs = nowMs;
      if (bucket.inFlight === 0) {
        this.buckets.delete(key);
      }
      return;
    }

    if (outcome === 'error') {
      const blockExpired = bucket.blockedUntilMs <= nowMs;
      const windowExpired = nowMs - bucket.windowStartedAtMs >= this.windowMs;
      if (bucket.inFlight === 0 && (bucket.failures === 0 || (blockExpired && windowExpired))) {
        this.buckets.delete(key);
      }
      return;
    }

    const blockExpired = bucket.blockedUntilMs > 0 && bucket.blockedUntilMs <= nowMs;
    const windowExpired =
      bucket.blockedUntilMs <= nowMs && nowMs - bucket.windowStartedAtMs >= this.windowMs;
    if (blockExpired || windowExpired) {
      bucket.failures = 1;
      bucket.blockedUntilMs = 0;
      bucket.windowStartedAtMs = nowMs;
    } else {
      bucket.failures += 1;
    }

    if (bucket.failures >= this.maxAttempts) {
      bucket.blockedUntilMs = Math.max(bucket.blockedUntilMs, nowMs + this.blockMs);
    }

    this.buckets.delete(key);
    this.buckets.set(key, bucket);
  }

  private normalizeKey(rawClientIp: string): string {
    const trimmed = rawClientIp.trim();
    if (!trimmed) {
      return 'ip:unknown';
    }
    return `ip:${trimmed.slice(0, 128).toLowerCase()}`;
  }

  private ensureCapacity(nowMs: number): void {
    if (this.buckets.size < this.maxKeys) {
      return;
    }

    for (const [k, v] of this.buckets.entries()) {
      const expiredBlock = v.blockedUntilMs <= nowMs;
      const expiredWindow = nowMs - v.windowStartedAtMs >= this.windowMs;
      const expiredPenalty = v.blockedUntilMs > 0 && expiredBlock;
      if (v.inFlight === 0 && (expiredPenalty || (expiredWindow && expiredBlock))) {
        this.buckets.delete(k);
      }
    }

    if (this.buckets.size >= this.maxKeys) {
      for (const [k, v] of this.buckets.entries()) {
        if (this.buckets.size < this.maxKeys) {
          break;
        }
        if (v.inFlight === 0) {
          this.buckets.delete(k);
        }
      }
    }

    if (this.buckets.size >= this.maxKeys) {
      throw new LoginThrottledException(this.inFlightRetryAfterSeconds);
    }
  }
}
