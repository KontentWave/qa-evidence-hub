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
  parseStrictIsoTimestamp,
  SHORT_TEXT_MAX_LENGTH,
} from '../common/validation.util';
import { PrismaService } from '../prisma/prisma.service';
import type { SessionDto } from './sessions.dto';

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

    const startedAt = parseStrictIsoTimestamp(input.startedAt);
    if (!startedAt) {
      throw new RequestValidationException([
        {
          field: 'startedAt',
          issues: ['Property "startedAt" failed "isStrictIsoTimestamp" validation.'],
        },
      ]);
    }

    let endedAt: Date | null = null;
    if (input.endedAt !== undefined && input.endedAt !== null && input.endedAt.trim() !== '') {
      const parsedEnd = parseStrictIsoTimestamp(input.endedAt);
      if (!parsedEnd) {
        throw new RequestValidationException([
          {
            field: 'endedAt',
            issues: ['Property "endedAt" failed "isStrictIsoTimestamp" validation.'],
          },
        ]);
      }
      if (parsedEnd.getTime() < startedAt.getTime()) {
        throw new RequestValidationException([
          {
            field: 'endedAt',
            issues: ['Property "endedAt" must not precede "startedAt".'],
          },
        ]);
      }
      endedAt = parsedEnd;
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
  ): Promise<{ readonly items: SessionDto[] }> {
    assertAuthorizedDomainActor(actor);
    const normalizedProjectId = assertValidUuidField('projectId', projectId);

    const parentProject = await this.prismaService.client.project.findUnique({
      where: { id: normalizedProjectId },
      select: { id: true },
    });
    if (!parentProject) {
      throw new NotFoundException();
    }

    const rows = await this.prismaService.client.testSession.findMany({
      where: { projectId: normalizedProjectId },
      orderBy: [{ startedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      take: DEFAULT_DOMAIN_LIST_LIMIT,
    });
    return { items: rows.map(toSessionDto) };
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
