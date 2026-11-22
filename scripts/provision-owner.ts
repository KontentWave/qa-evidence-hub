import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

interface PgQueryResult<TRow> {
  readonly rows: readonly TRow[];
  readonly rowCount: number | null;
}

interface PgClientInstance {
  connect(): Promise<void>;
  query<TRow = Record<string, unknown>>(
    sql: string,
    values?: readonly unknown[],
  ): Promise<PgQueryResult<TRow>>;
  end(): Promise<void>;
}

interface PgModuleShape {
  readonly Client: new (config: {
    connectionString: string;
    connectionTimeoutMillis: number;
    statement_timeout: number;
    query_timeout: number;
  }) => PgClientInstance;
}

const currentFilePath = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(currentFilePath);
const apiPkgPath = path.resolve(scriptDir, '../apps/api/package.json');
const apiRequire = createRequire(apiPkgPath);
const pg = apiRequire('pg') as PgModuleShape;

const DEFAULT_TIMEZONE = 'Europe/Bratislava';
const MIN_PASSWORD_CHARS = 12;
const MAX_PASSWORD_CHARS = 256;
const MAX_PASSWORD_BYTES = 1024;
const MAX_STDIN_BYTES = 4096;

const SCRYPT_LN = 16; // N = 2^16 = 65536
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;
const SCRYPT_MAXMEM = 128 * 1024 * 1024;

type OperatorCommand = 'provision' | 'reset-password';

export interface ParsedOperatorArgs {
  readonly command: OperatorCommand;
  readonly loginIdentifier?: string;
  readonly timezone: string;
  readonly passwordStdin: boolean;
}

class CliUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CliUsageError';
  }
}

function hasAsciiControlChar(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) {
      return true;
    }
  }
  return false;
}

function formatUsage(): string {
  return [
    'Usage:',
    '  node scripts/provision-owner.ts provision --login <identifier> [--timezone <iana-tz>] [--password-stdin]',
    '  node scripts/provision-owner.ts reset-password [--login <identifier>] [--password-stdin]',
    '',
    'Notes:',
    '  - Passwords are accepted ONLY via hidden interactive TTY prompt or --password-stdin.',
    '  - Passing passwords on the command line (--password / -p) is forbidden.',
  ].join('\n');
}

export function parseOperatorArgs(argv: readonly string[]): ParsedOperatorArgs {
  if (argv.includes('--help') || argv.includes('-h')) {
    throw new CliUsageError(formatUsage());
  }

  for (const arg of argv) {
    if (arg === '--password' || arg === '-p' || arg.startsWith('--password=') || arg.startsWith('-p=')) {
      throw new CliUsageError(
        'Passing passwords via CLI arguments is forbidden. Supply the password via hidden TTY prompt or --password-stdin.',
      );
    }
  }

  const rawCommand = argv[0];
  let command: OperatorCommand;
  if (rawCommand === 'provision') {
    command = 'provision';
  } else if (rawCommand === 'reset-password' || rawCommand === 'reset') {
    command = 'reset-password';
  } else {
    throw new CliUsageError(`Unknown or missing command.\n${formatUsage()}`);
  }

  let loginIdentifier: string | undefined;
  let timezone = DEFAULT_TIMEZONE;
  let passwordStdin = false;

  for (let i = 1; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--password-stdin') {
      passwordStdin = true;
      continue;
    }
    if (token === '--login') {
      const next = argv[i + 1];
      if (!next || next.startsWith('-')) {
        throw new CliUsageError('Flag --login requires a non-empty value.');
      }
      loginIdentifier = next;
      i += 1;
      continue;
    }
    if (token?.startsWith('--login=')) {
      loginIdentifier = token.slice('--login='.length);
      continue;
    }
    if (token === '--timezone') {
      if (command !== 'provision') {
        throw new CliUsageError('Flag --timezone is supported only with "provision".');
      }
      const next = argv[i + 1];
      if (!next || next.startsWith('-')) {
        throw new CliUsageError('Flag --timezone requires an IANA timezone value.');
      }
      timezone = next;
      i += 1;
      continue;
    }
    if (token?.startsWith('--timezone=')) {
      if (command !== 'provision') {
        throw new CliUsageError('Flag --timezone is supported only with "provision".');
      }
      timezone = token.slice('--timezone='.length);
      continue;
    }

    throw new CliUsageError(`Unrecognized CLI option.\n${formatUsage()}`);
  }

  if (command === 'provision' && (!loginIdentifier || loginIdentifier.trim() === '')) {
    throw new CliUsageError('Command "provision" requires --login <identifier>.');
  }

  const normalizedLogin = loginIdentifier?.trim();
  if (normalizedLogin !== undefined) {
    if (
      normalizedLogin.length === 0 ||
      normalizedLogin.length > 200 ||
      hasAsciiControlChar(normalizedLogin)
    ) {
      throw new CliUsageError('--login must be 1..200 printable characters.');
    }
  }

  const normalizedTimezone = timezone.trim();
  if (normalizedTimezone.length === 0 || normalizedTimezone.length > 100) {
    throw new CliUsageError('--timezone must be 1..100 characters.');
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: normalizedTimezone });
  } catch {
    throw new CliUsageError('--timezone must be a valid IANA timezone identifier.');
  }

  return {
    command,
    loginIdentifier: normalizedLogin,
    timezone: normalizedTimezone,
    passwordStdin,
  };
}

export function validateOwnerPasswordPolicy(password: string, loginIdentifier?: string): void {
  const byteLength = Buffer.byteLength(password, 'utf8');
  if (password.length < MIN_PASSWORD_CHARS) {
    throw new CliUsageError(`Password must be at least ${MIN_PASSWORD_CHARS} characters long.`);
  }
  if (password.length > MAX_PASSWORD_CHARS || byteLength > MAX_PASSWORD_BYTES) {
    throw new CliUsageError(`Password must not exceed ${MAX_PASSWORD_CHARS} characters.`);
  }
  if (password.trim().length === 0) {
    throw new CliUsageError('Password must contain non-whitespace characters.');
  }
  if (hasAsciiControlChar(password)) {
    throw new CliUsageError('Password must not contain control characters.');
  }
  if (loginIdentifier && password.toLowerCase() === loginIdentifier.toLowerCase()) {
    throw new CliUsageError('Password must not match the login identifier.');
  }
}

export async function hashOwnerPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const cost = 1 << SCRYPT_LN;
  const derivedKey = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(
      password,
      salt,
      SCRYPT_KEYLEN,
      { N: cost, r: SCRYPT_R, p: SCRYPT_P, maxmem: SCRYPT_MAXMEM },
      (err, key) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(key);
      },
    );
  });

  const saltB64 = salt.toString('base64').replace(/=+$/g, '');
  const hashB64 = derivedKey.toString('base64').replace(/=+$/g, '');
  return `$scrypt$ln=${SCRYPT_LN},r=${SCRYPT_R},p=${SCRYPT_P}$${saltB64}$${hashB64}`;
}

async function readPasswordFromStream(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of stream) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), 'utf8');
    totalBytes += buf.length;
    if (totalBytes > MAX_STDIN_BYTES) {
      throw new CliUsageError('Password stdin input exceeded maximum permitted length.');
    }
    chunks.push(buf);
  }

  const raw = Buffer.concat(chunks).toString('utf8');
  const firstLine = raw.replace(/\r?\n$/, '');
  if (firstLine.includes('\n') || firstLine.includes('\r')) {
    throw new CliUsageError('Password stdin input must contain a single line.');
  }
  return firstLine;
}

async function promptHiddenLine(promptText: string): Promise<string> {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
    throw new CliUsageError(
      'Interactive hidden prompt requires a TTY; pass --password-stdin when piping via stdin.',
    );
  }

  process.stderr.write(promptText);
  process.stdin.setRawMode(true);
  process.stdin.resume();

  return new Promise<string>((resolve, reject) => {
    const chars: string[] = [];

    const cleanup = () => {
      process.stdin.removeListener('data', onData);
      if (process.stdin.isTTY && typeof process.stdin.setRawMode === 'function') {
        process.stdin.setRawMode(false);
      }
      process.stdin.pause();
    };

    const onData = (chunk: Buffer) => {
      const str = chunk.toString('utf8');
      for (const ch of str) {
        if (ch === '\r' || ch === '\n') {
          cleanup();
          process.stderr.write('\n');
          resolve(chars.join(''));
          return;
        }
        if (ch === '\u0003' || ch === '\u0004') {
          cleanup();
          process.stderr.write('\n');
          reject(new CliUsageError('Password prompt aborted by operator.'));
          return;
        }
        if (ch === '\u007f' || ch === '\b') {
          chars.pop();
          continue;
        }
        chars.push(ch);
      }
    };

    process.stdin.on('data', onData);
  });
}

async function readOperatorPassword(passwordStdin: boolean): Promise<string> {
  if (passwordStdin || !process.stdin.isTTY) {
    return readPasswordFromStream(process.stdin);
  }

  const first = await promptHiddenLine('Enter owner password: ');
  const second = await promptHiddenLine('Confirm owner password: ');
  if (first !== second) {
    throw new CliUsageError('Entered passwords did not match.');
  }
  return first;
}

function validateDatabaseUrlForCli(rawUrl: string | undefined): string {
  if (!rawUrl || rawUrl.trim() === '') {
    throw new CliUsageError('DATABASE_URL environment variable is required.');
  }
  const trimmed = rawUrl.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new CliUsageError('DATABASE_URL must be a valid PostgreSQL connection URI.');
  }
  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    throw new CliUsageError('DATABASE_URL must use postgresql:// or postgres://.');
  }
  if (!parsed.hostname || !parsed.pathname.replace(/^\/+/, '')) {
    throw new CliUsageError('DATABASE_URL must specify a host and database name.');
  }
  return trimmed;
}

function isPgUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === '23505'
  );
}

async function executeOperatorCommand(parsed: ParsedOperatorArgs, databaseUrl: string): Promise<string> {
  const password = await readOperatorPassword(parsed.passwordStdin);
  validateOwnerPasswordPolicy(password, parsed.loginIdentifier);
  const passwordHash = await hashOwnerPassword(password);

  const client = new pg.Client({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 5000,
    statement_timeout: 5000,
    query_timeout: 5000,
  });

  await client.connect();
  try {
    if (parsed.command === 'provision') {
      const ownerId = crypto.randomUUID();
      try {
        await client.query(
          `INSERT INTO "owners" (
             "id",
             "singleton_key",
             "login_identifier",
             "password_hash",
             "timezone",
             "created_at",
             "updated_at"
           ) VALUES ($1, true, $2, $3, $4, NOW(), NOW());`,
          [ownerId, parsed.loginIdentifier, passwordHash, parsed.timezone],
        );
      } catch (error: unknown) {
        if (isPgUniqueViolation(error)) {
          throw new CliUsageError(
            'Provisioning refused: the single owner account is already provisioned. Use "reset-password" to rotate credentials.',
          );
        }
        throw new Error('Database write failed while provisioning owner account.', {
          cause: error,
        });
      }

      return `Provisioned single owner account (${ownerId}) with timezone ${parsed.timezone}.`;
    }

    await client.query('BEGIN');
    try {
      const existing = await client.query<{ id: string; login_identifier: string }>(
        'SELECT "id", "login_identifier" FROM "owners" WHERE "singleton_key" = true FOR UPDATE;',
      );

      const ownerRow = existing.rows[0];
      if (!ownerRow) {
        throw new CliUsageError('Password reset failed: no owner account has been provisioned yet.');
      }

      if (
        parsed.loginIdentifier !== undefined &&
        ownerRow.login_identifier.toLowerCase() !== parsed.loginIdentifier.toLowerCase()
      ) {
        throw new CliUsageError(
          'Password reset refused: --login does not match the provisioned owner account.',
        );
      }

      validateOwnerPasswordPolicy(password, ownerRow.login_identifier);

      await client.query(
        'UPDATE "owners" SET "password_hash" = $1, "updated_at" = NOW() WHERE "id" = $2;',
        [passwordHash, ownerRow.id],
      );

      const revoked = await client.query(
        `UPDATE "auth_sessions"
         SET "revoked_at" = NOW(), "revoke_reason" = 'password_reset'
         WHERE "owner_id" = $1 AND "revoked_at" IS NULL;`,
        [ownerRow.id],
      );

      await client.query('COMMIT');
      return `Reset owner password (${ownerRow.id}) and revoked ${revoked.rowCount ?? 0} active session(s).`;
    } catch (error: unknown) {
      await client.query('ROLLBACK').catch(() => undefined);
      if (error instanceof CliUsageError) {
        throw error;
      }
      throw new Error('Database transaction failed while resetting owner password.', {
        cause: error,
      });
    }
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function main(): Promise<void> {
  try {
    const parsed = parseOperatorArgs(process.argv.slice(2));
    const databaseUrl = validateDatabaseUrlForCli(process.env.DATABASE_URL);
    const summary = await executeOperatorCommand(parsed, databaseUrl);
    process.stdout.write(`${summary}\n`);
  } catch (error: unknown) {
    if (error instanceof CliUsageError) {
      process.stderr.write(`${error.message}\n`);
      process.exit(1);
    }
    process.stderr.write('Operator command failed due to an unexpected database or runtime error.\n');
    process.exit(1);
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === currentFilePath) {
  void main();
}
