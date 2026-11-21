import crypto from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { LoginThrottledException } from '../common/http-exception.filter';
import { API_ENV, type ApiEnv } from '../config/env.validation';

const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;
const SCRYPT_MAXMEM = 128 * 1024 * 1024;
const MIN_ALLOWED_LN = 14;
const MAX_ALLOWED_LN = 18;
const MAX_PASSWORD_BYTES = 1024;
const MAX_CONCURRENT_HASHES = 4;
const MAX_HASH_WAIT_QUEUE = 16;

const PHC_SCRYPT_REGEX =
  /^\$scrypt\$ln=(\d{1,2}),r=(\d{1,2}),p=(\d{1,2})\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/;

function decodeUnpaddedBase64(b64: string): Buffer {
  const remainder = b64.length % 4;
  const padded = remainder === 0 ? b64 : `${b64}${'='.repeat(4 - remainder)}`;
  return Buffer.from(padded, 'base64');
}

function encodeUnpaddedBase64(buf: Buffer): string {
  return buf.toString('base64').replace(/=+$/g, '');
}

@Injectable()
export class PasswordHasherService {
  private readonly defaultLn: number;
  private readonly dummyHash: string;
  private activeCount = 0;
  private readonly waitQueue: Array<() => void> = [];

  constructor(@Inject(API_ENV) env: ApiEnv) {
    this.defaultLn = env.passwordScryptLn;
    const dummySalt = Buffer.alloc(16, 0x5a);
    const dummyKey = crypto.scryptSync('qaeh-timing-equalizer-placeholder', dummySalt, SCRYPT_KEYLEN, {
      N: 1 << this.defaultLn,
      r: SCRYPT_R,
      p: SCRYPT_P,
      maxmem: SCRYPT_MAXMEM,
    });
    this.dummyHash = `$scrypt$ln=${this.defaultLn},r=${SCRYPT_R},p=${SCRYPT_P}$${encodeUnpaddedBase64(dummySalt)}$${encodeUnpaddedBase64(dummyKey)}`;
  }

  public async hashPassword(password: string): Promise<string> {
    if (password.length === 0 || Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) {
      throw new Error('Password length is outside permitted bounds.');
    }
    const salt = crypto.randomBytes(16);
    const derived = await this.deriveKeyBounded(password, salt, this.defaultLn, SCRYPT_R, SCRYPT_P);
    return `$scrypt$ln=${this.defaultLn},r=${SCRYPT_R},p=${SCRYPT_P}$${encodeUnpaddedBase64(salt)}$${encodeUnpaddedBase64(derived)}`;
  }

  public async verifyPassword(password: string, encodedHash: string): Promise<boolean> {
    if (password.length === 0 || Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) {
      return false;
    }

    const match = PHC_SCRYPT_REGEX.exec(encodedHash);
    if (!match) {
      return false;
    }

    const ln = Number.parseInt(match[1]!, 10);
    const r = Number.parseInt(match[2]!, 10);
    const p = Number.parseInt(match[3]!, 10);
    if (ln < MIN_ALLOWED_LN || ln > MAX_ALLOWED_LN || r < 1 || r > 16 || p < 1 || p > 4) {
      return false;
    }

    const salt = decodeUnpaddedBase64(match[4]!);
    const expectedKey = decodeUnpaddedBase64(match[5]!);
    if (salt.length < 16 || expectedKey.length !== SCRYPT_KEYLEN) {
      return false;
    }

    const actualKey = await this.deriveKeyBounded(password, salt, ln, r, p);
    return crypto.timingSafeEqual(actualKey, expectedKey);
  }

  public async verifyOrEqualize(password: string, candidateHash: string | null): Promise<boolean> {
    if (!candidateHash) {
      await this.verifyPassword(password, this.dummyHash);
      return false;
    }
    return this.verifyPassword(password, candidateHash);
  }

  private async acquireSlot(): Promise<void> {
    if (this.activeCount < MAX_CONCURRENT_HASHES) {
      this.activeCount += 1;
      return;
    }
    if (this.waitQueue.length >= MAX_HASH_WAIT_QUEUE) {
      throw new LoginThrottledException(5);
    }
    await new Promise<void>((resolve) => {
      this.waitQueue.push(resolve);
    });
    this.activeCount += 1;
  }

  private releaseSlot(): void {
    this.activeCount -= 1;
    const next = this.waitQueue.shift();
    if (next) {
      next();
    }
  }

  private async deriveKeyBounded(
    password: string,
    salt: Buffer,
    ln: number,
    r: number,
    p: number,
  ): Promise<Buffer> {
    await this.acquireSlot();
    try {
      const cost = 1 << ln;
      return await new Promise<Buffer>((resolve, reject) => {
        crypto.scrypt(
          password,
          salt,
          SCRYPT_KEYLEN,
          { N: cost, r, p, maxmem: SCRYPT_MAXMEM },
          (err, derivedKey) => {
            if (err) {
              reject(err);
              return;
            }
            resolve(derivedKey);
          },
        );
      });
    } finally {
      this.releaseSlot();
    }
  }
}
