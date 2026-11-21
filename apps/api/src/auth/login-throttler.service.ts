import { Inject, Injectable } from '@nestjs/common';
import { LoginThrottledException } from '../common/http-exception.filter';
import { API_ENV, type ApiEnv } from '../config/env.validation';

interface ThrottleBucket {
  failures: number;
  windowStartedAtMs: number;
  blockedUntilMs: number;
}

@Injectable()
export class LoginThrottlerService {
  private readonly maxAttempts: number;
  private readonly windowMs: number;
  private readonly blockMs: number;
  private readonly maxKeys: number;
  private readonly buckets = new Map<string, ThrottleBucket>();

  constructor(@Inject(API_ENV) env: ApiEnv) {
    this.maxAttempts = env.loginMaxAttempts;
    this.windowMs = env.loginWindowSeconds * 1000;
    this.blockMs = env.loginBlockSeconds * 1000;
    this.maxKeys = env.loginThrottleMaxKeys;
  }

  public assertAllowed(rawClientIp: string, nowMs = Date.now()): void {
    const key = this.normalizeKey(rawClientIp);
    const bucket = this.buckets.get(key);
    if (!bucket) {
      return;
    }

    if (bucket.blockedUntilMs > nowMs) {
      const retryAfterSeconds = Math.max(1, Math.ceil((bucket.blockedUntilMs - nowMs) / 1000));
      throw new LoginThrottledException(retryAfterSeconds);
    }

    if (nowMs - bucket.windowStartedAtMs >= this.windowMs) {
      this.buckets.delete(key);
    }
  }

  public recordFailure(rawClientIp: string, nowMs = Date.now()): void {
    const key = this.normalizeKey(rawClientIp);
    const existing = this.buckets.get(key);

    if (!existing || nowMs - existing.windowStartedAtMs >= this.windowMs) {
      this.buckets.delete(key);
      this.ensureCapacity(nowMs);
      const blockedUntilMs = this.maxAttempts <= 1 ? nowMs + this.blockMs : 0;
      this.buckets.set(key, {
        failures: 1,
        windowStartedAtMs: nowMs,
        blockedUntilMs,
      });
      if (blockedUntilMs > nowMs) {
        throw new LoginThrottledException(Math.ceil(this.blockMs / 1000));
      }
      return;
    }

    existing.failures += 1;
    // Refresh insertion order for LRU behavior.
    this.buckets.delete(key);
    this.buckets.set(key, existing);

    if (existing.failures >= this.maxAttempts) {
      existing.blockedUntilMs = nowMs + this.blockMs;
      throw new LoginThrottledException(Math.ceil(this.blockMs / 1000));
    }
  }

  public resetKey(rawClientIp: string): void {
    this.buckets.delete(this.normalizeKey(rawClientIp));
  }

  public getTrackedKeyCount(): number {
    return this.buckets.size;
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
      const expiredWindow = nowMs - v.windowStartedAtMs >= this.windowMs;
      const expiredBlock = v.blockedUntilMs <= nowMs;
      if (expiredWindow && expiredBlock) {
        this.buckets.delete(k);
      }
    }

    while (this.buckets.size >= this.maxKeys) {
      const oldestKey = this.buckets.keys().next().value;
      if (oldestKey === undefined) {
        break;
      }
      this.buckets.delete(oldestKey);
    }
  }
}
