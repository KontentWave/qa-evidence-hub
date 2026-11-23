import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ProjectStatus, type Project } from '@prisma/client';
import type { AuthenticatedActor } from '../auth/auth.decorators';
import {
  assertAuthorizedDomainActor,
  assertValidUuidField,
  DEFAULT_DOMAIN_LIST_LIMIT,
  LONG_TEXT_MAX_LENGTH,
  normalizeOptionalTextField,
  normalizeRequiredTextField,
  SHORT_TEXT_MAX_LENGTH,
} from '../common/validation.util';
import { PrismaService } from '../prisma/prisma.service';
import type { ProjectDto } from './projects.dto';

export interface CreateProjectInput {
  readonly name: string;
  readonly description?: string | null;
  readonly testingContext?: string | null;
  readonly instructions?: string | null;
}

function toProjectDto(row: Project): ProjectDto {
  return {
    id: row.id,
    clientId: row.clientId,
    name: row.name,
    status: row.status,
    description: row.description,
    testingContext: row.testingContext,
    instructions: row.instructions,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class ProjectsService {
  constructor(@Inject(PrismaService) private readonly prismaService: PrismaService) {}

  public async createProject(
    actor: AuthenticatedActor | undefined,
    clientId: string,
    input: CreateProjectInput,
  ): Promise<ProjectDto> {
    assertAuthorizedDomainActor(actor);
    const normalizedClientId = assertValidUuidField('clientId', clientId);
    const name = normalizeRequiredTextField('name', input.name, SHORT_TEXT_MAX_LENGTH);
    const description = normalizeOptionalTextField(
      'description',
      input.description,
      LONG_TEXT_MAX_LENGTH,
    );
    const testingContext = normalizeOptionalTextField(
      'testingContext',
      input.testingContext,
      LONG_TEXT_MAX_LENGTH,
    );
    const instructions = normalizeOptionalTextField(
      'instructions',
      input.instructions,
      LONG_TEXT_MAX_LENGTH,
    );

    const parentClient = await this.prismaService.client.client.findUnique({
      where: { id: normalizedClientId },
      select: { id: true },
    });
    if (!parentClient) {
      throw new NotFoundException();
    }

    try {
      const created = await this.prismaService.client.project.create({
        data: {
          clientId: normalizedClientId,
          name,
          status: ProjectStatus.Active,
          description,
          testingContext,
          instructions,
        },
      });
      return toProjectDto(created);
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw new NotFoundException();
      }
      throw error;
    }
  }

  public async listProjects(
    actor: AuthenticatedActor | undefined,
    clientId: string,
  ): Promise<{ readonly items: ProjectDto[] }> {
    assertAuthorizedDomainActor(actor);
    const normalizedClientId = assertValidUuidField('clientId', clientId);

    const parentClient = await this.prismaService.client.client.findUnique({
      where: { id: normalizedClientId },
      select: { id: true },
    });
    if (!parentClient) {
      throw new NotFoundException();
    }

    const rows = await this.prismaService.client.project.findMany({
      where: { clientId: normalizedClientId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: DEFAULT_DOMAIN_LIST_LIMIT,
    });
    return { items: rows.map(toProjectDto) };
  }

  public async getProject(
    actor: AuthenticatedActor | undefined,
    clientId: string,
    projectId: string,
  ): Promise<ProjectDto> {
    assertAuthorizedDomainActor(actor);
    const normalizedClientId = assertValidUuidField('clientId', clientId);
    const normalizedProjectId = assertValidUuidField('projectId', projectId);

    const row = await this.prismaService.client.project.findFirst({
      where: {
        id: normalizedProjectId,
        clientId: normalizedClientId,
      },
    });
    if (!row) {
      throw new NotFoundException();
    }
    return toProjectDto(row);
  }
}
