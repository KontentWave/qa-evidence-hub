import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ProjectStatus, type TestSession } from '@prisma/client';
import type { AuthenticatedActor } from '../auth/auth.decorators';
import { RequestValidationException } from '../common/http-exception.filter';
import {
  assertAuthorizedDomainActor,
  assertValidUuidField,
  DEFAULT_DOMAIN_LIST_LIMIT,
  LONG_TEXT_MAX_LENGTH,
  normalizeOptionalTextField,
  normalizeRequiredTextField,
  parseStrictIsoInstant,
  SHORT_TEXT_MAX_LENGTH,
} from '../common/validation.util';
import { PrismaService } from '../prisma/prisma.service';
import type { SessionDto, SessionListResponseDto } from './sessions.dto';

export interface CreateSessionInput {
  readonly purpose: string;
  readonly startedAt: string;
  readonly endedAt?: string | null;
  readonly environment?: string | null;
  readonly device?: string | null;
  readonly os?: string | null;
  readonly browser?: string | null;
  readonly buildVersion?: string | null;
  readonly notes?: string | null;
}

export interface ListSessionsOptions {
  readonly cursor?: string;
  readonly limit?: number;
}

export interface SessionCursorPayload {
  readonly startedAt: string;
  readonly createdAt: string;
  readonly id: string;
}

interface SessionListQueryRow extends TestSession {
  readonly startedAtCursor: string;
  readonly createdAtCursor: string;
}

const CANONICAL_UTC_MICROS_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;
const CURSOR_BASE64URL_REGEX = /^[A-Za-z0-9_-]{1,256}$/;
const SESSION_CURSOR_UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function encodeSessionCursor(cursor: SessionCursorPayload): string {
  return Buffer.from(
    `${cursor.startedAt}|${cursor.createdAt}|${cursor.id.toLowerCase()}`,
    'utf8',
  ).toString('base64url');
}

function invalidCursorException(): RequestValidationException {
  return new RequestValidationException([
    {
      field: 'cursor',
      issues: ['Property "cursor" failed "isSessionCursor" validation.'],
    },
  ]);
}

function decodeSessionCursor(raw: string): SessionCursorPayload {
  const trimmed = raw.trim();
  if (!CURSOR_BASE64URL_REGEX.test(trimmed)) {
    throw invalidCursorException();
  }

  const decoded = Buffer.from(trimmed, 'base64url').toString('utf8');
  if (Buffer.from(decoded, 'utf8').toString('base64url') !== trimmed) {
    throw invalidCursorException();
  }

  const parts = decoded.split('|');
  if (parts.length !== 3) {
    throw invalidCursorException();
  }

  const [startedAt, createdAt, id] = parts as [string, string, string];
  if (
    !CANONICAL_UTC_MICROS_REGEX.test(startedAt) ||
    !CANONICAL_UTC_MICROS_REGEX.test(createdAt) ||
    parseStrictIsoInstant(startedAt) === null ||
    parseStrictIsoInstant(createdAt) === null ||
    !SESSION_CURSOR_UUID_REGEX.test(id)
  ) {
    throw invalidCursorException();
  }

  return {
    startedAt,
    createdAt,
    id: id.toLowerCase(),
  };
}

function normalizeListSessionsLimit(rawLimit: number | undefined): number {
  if (rawLimit === undefined) {
    return DEFAULT_DOMAIN_LIST_LIMIT;
  }
  if (!Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > DEFAULT_DOMAIN_LIST_LIMIT) {
    throw new RequestValidationException([
      {
        field: 'limit',
        issues: ['Property "limit" failed "listLimitRange" validation.'],
      },
    ]);
  }
  return rawLimit;
}

function toSessionDto(row: TestSession): SessionDto {
  return {
    id: row.id,
    projectId: row.projectId,
    purpose: row.purpose,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt ? row.endedAt.toISOString() : null,
    environment: row.environment,
    device: row.device,
    os: row.os,
    browser: row.browser,
    buildVersion: row.buildVersion,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class SessionsService {
  constructor(@Inject(PrismaService) private readonly prismaService: PrismaService) {}

  public async createSession(
    actor: AuthenticatedActor | undefined,
    projectId: string,
    input: CreateSessionInput,
  ): Promise<SessionDto> {
    assertAuthorizedDomainActor(actor);
    const normalizedProjectId = assertValidUuidField('projectId', projectId);
    const purpose = normalizeRequiredTextField('purpose', input.purpose, SHORT_TEXT_MAX_LENGTH);

    const startedInstant = parseStrictIsoInstant(input.startedAt);
    if (!startedInstant) {
      throw new RequestValidationException([
        {
          field: 'startedAt',
          issues: ['Property "startedAt" failed "isStrictIsoTimestamp" validation.'],
        },
      ]);
    }
    const startedAt = startedInstant.date;

    let endedAt: Date | null = null;
    if (input.endedAt !== undefined && input.endedAt !== null && input.endedAt.trim() !== '') {
      const endedInstant = parseStrictIsoInstant(input.endedAt);
      if (!endedInstant) {
        throw new RequestValidationException([
          {
            field: 'endedAt',
            issues: ['Property "endedAt" failed "isStrictIsoTimestamp" validation.'],
          },
        ]);
      }
      if (endedInstant.epochMicros < startedInstant.epochMicros) {
        throw new RequestValidationException([
          {
            field: 'endedAt',
            issues: ['Property "endedAt" must not precede "startedAt".'],
          },
        ]);
      }
      endedAt = endedInstant.date;
    }

    const environment = normalizeOptionalTextField(
      'environment',
      input.environment,
      SHORT_TEXT_MAX_LENGTH,
    );
    const device = normalizeOptionalTextField('device', input.device, SHORT_TEXT_MAX_LENGTH);
    const os = normalizeOptionalTextField('os', input.os, SHORT_TEXT_MAX_LENGTH);
    const browser = normalizeOptionalTextField('browser', input.browser, SHORT_TEXT_MAX_LENGTH);
    const buildVersion = normalizeOptionalTextField(
      'buildVersion',
      input.buildVersion,
      SHORT_TEXT_MAX_LENGTH,
    );
    const notes = normalizeOptionalTextField('notes', input.notes, LONG_TEXT_MAX_LENGTH);

    const created = await this.prismaService.client.$transaction(async (tx) => {
      const lockedProjects = await tx.$queryRaw<Array<{ id: string; status: string }>>`
        SELECT "id", "status"::text AS "status"
        FROM "projects"
        WHERE "id" = ${normalizedProjectId}::uuid
        FOR SHARE
      `;

      const parentProject = lockedProjects[0];
      if (!parentProject) {
        throw new NotFoundException();
      }
      if (parentProject.status !== ProjectStatus.Active) {
        throw new ConflictException();
      }

      return tx.testSession.create({
        data: {
          projectId: normalizedProjectId,
          purpose,
          startedAt,
          endedAt,
          environment,
          device,
          os,
          browser,
          buildVersion,
          notes,
        },
      });
    });

    return toSessionDto(created);
  }

  public async listSessions(
    actor: AuthenticatedActor | undefined,
    projectId: string,
    options: ListSessionsOptions = {},
  ): Promise<SessionListResponseDto> {
    assertAuthorizedDomainActor(actor);
    const normalizedProjectId = assertValidUuidField('projectId', projectId);
    const limit = normalizeListSessionsLimit(options.limit);
    const decodedCursor =
      options.cursor !== undefined ? decodeSessionCursor(options.cursor) : null;

    const parentProject = await this.prismaService.client.project.findUnique({
      where: { id: normalizedProjectId },
      select: { id: true },
    });
    if (!parentProject) {
      throw new NotFoundException();
    }

    const takePlusOne = limit + 1;
    const rows = decodedCursor
      ? await this.prismaService.client.$queryRaw<SessionListQueryRow[]>`
          SELECT
            "id",
            "project_id" AS "projectId",
            "purpose",
            "started_at" AS "startedAt",
            "ended_at" AS "endedAt",
            "environment",
            "device",
            "os",
            "browser",
            "build_version" AS "buildVersion",
            "notes",
            "created_at" AS "createdAt",
            "updated_at" AS "updatedAt",
            to_char("started_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "startedAtCursor",
            to_char("created_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "createdAtCursor"
          FROM "test_sessions"
          WHERE "project_id" = ${normalizedProjectId}::uuid
            AND ("started_at", "created_at", "id") < (
              ${decodedCursor.startedAt}::timestamptz,
              ${decodedCursor.createdAt}::timestamptz,
              ${decodedCursor.id}::uuid
            )
          ORDER BY "started_at" DESC, "created_at" DESC, "id" DESC
          LIMIT ${takePlusOne}
        `
      : await this.prismaService.client.$queryRaw<SessionListQueryRow[]>`
          SELECT
            "id",
            "project_id" AS "projectId",
            "purpose",
            "started_at" AS "startedAt",
            "ended_at" AS "endedAt",
            "environment",
            "device",
            "os",
            "browser",
            "build_version" AS "buildVersion",
            "notes",
            "created_at" AS "createdAt",
            "updated_at" AS "updatedAt",
            to_char("started_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "startedAtCursor",
            to_char("created_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "createdAtCursor"
          FROM "test_sessions"
          WHERE "project_id" = ${normalizedProjectId}::uuid
          ORDER BY "started_at" DESC, "created_at" DESC, "id" DESC
          LIMIT ${takePlusOne}
        `;

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore
      ? encodeSessionCursor({
          startedAt: pageRows[pageRows.length - 1]!.startedAtCursor,
          createdAt: pageRows[pageRows.length - 1]!.createdAtCursor,
          id: pageRows[pageRows.length - 1]!.id,
        })
      : null;

    return { items: pageRows.map(toSessionDto), nextCursor };
  }

  public async getSession(
    actor: AuthenticatedActor | undefined,
    projectId: string,
    sessionId: string,
  ): Promise<SessionDto> {
    assertAuthorizedDomainActor(actor);
    const normalizedProjectId = assertValidUuidField('projectId', projectId);
    const normalizedSessionId = assertValidUuidField('sessionId', sessionId);

    const row = await this.prismaService.client.testSession.findFirst({
      where: {
        id: normalizedSessionId,
        projectId: normalizedProjectId,
      },
    });
    if (!row) {
      throw new NotFoundException();
    }
    return toSessionDto(row);
  }
}
