import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Prisma, ProjectStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedActor } from '../auth/auth.decorators';
import { RequestValidationException } from '../common/http-exception.filter';
import type { PrismaService } from '../prisma/prisma.service';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';

const ACTOR: AuthenticatedActor = {
  ownerId: '11111111-2222-4333-8444-555555555555',
  loginIdentifier: 'owner@synthetic.invalid',
  timezone: 'Europe/Bratislava',
  sessionId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
};

const CLIENT_ID = '22222222-3333-4444-8555-666666666666';
const PROJECT_ID = '33333333-4444-4555-8666-777777777777';

describe('ProjectsService & ProjectsController', () => {
  it('enforces explicit actor authorization and parent-scoped client existence/mismatch checks', async () => {
    const fixedDate = new Date('2026-10-06T09:00:00.000Z');
    const clientFindUnique = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: CLIENT_ID })
      .mockResolvedValueOnce({ id: CLIENT_ID })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: CLIENT_ID });

    const fkRaceError = new Prisma.PrismaClientKnownRequestError('FK violation', {
      code: 'P2003',
      clientVersion: '7.10.1',
    });
    const unexpectedDbError = new Error('Unexpected DB failure');

    const projectCreate = vi
      .fn()
      .mockResolvedValueOnce({
        id: PROJECT_ID,
        clientId: CLIENT_ID,
        name: 'Checkout QA',
        status: ProjectStatus.Active,
        description: 'Scope',
        testingContext: null,
        instructions: 'Instructions',
        createdAt: fixedDate,
        updatedAt: fixedDate,
      })
      .mockRejectedValueOnce(fkRaceError)
      .mockRejectedValueOnce(unexpectedDbError);

    const projectFindMany = vi.fn(async () => [
      {
        id: PROJECT_ID,
        clientId: CLIENT_ID,
        name: 'Checkout QA',
        status: ProjectStatus.Active,
        description: null,
        testingContext: null,
        instructions: null,
        createdAt: fixedDate,
        updatedAt: fixedDate,
      },
    ]);

    const projectFindFirst = vi
      .fn()
      .mockResolvedValueOnce({
        id: PROJECT_ID,
        clientId: CLIENT_ID,
        name: 'Checkout QA',
        status: ProjectStatus.Active,
        description: null,
        testingContext: null,
        instructions: null,
        createdAt: fixedDate,
        updatedAt: fixedDate,
      })
      .mockResolvedValueOnce(null);

    const service = new ProjectsService({
      client: {
        client: { findUnique: clientFindUnique },
        project: {
          create: projectCreate,
          findMany: projectFindMany,
          findFirst: projectFindFirst,
        },
      },
    } as unknown as PrismaService);

    const controller = new ProjectsController(service);

    await expect(
      service.createProject(undefined, CLIENT_ID, { name: 'Checkout QA' }),
    ).rejects.toThrow(UnauthorizedException);
    await expect(service.listProjects(undefined, CLIENT_ID)).rejects.toThrow(
      UnauthorizedException,
    );
    await expect(service.getProject(undefined, CLIENT_ID, PROJECT_ID)).rejects.toThrow(
      UnauthorizedException,
    );

    // Missing parent client on create -> 404
    await expect(
      controller.createProject({ clientId: CLIENT_ID }, {}, { name: 'Checkout QA' }, ACTOR),
    ).rejects.toThrow(NotFoundException);

    // Valid create starts Active and trims optional text
    const created = await controller.createProject(
      { clientId: CLIENT_ID },
      {},
      {
        name: '  Checkout QA  ',
        description: '  Scope  ',
        testingContext: '   ',
        instructions: 'Instructions',
      },
      ACTOR,
    );
    expect(created).toEqual({
      id: PROJECT_ID,
      clientId: CLIENT_ID,
      name: 'Checkout QA',
      status: 'Active',
      description: 'Scope',
      testingContext: null,
      instructions: 'Instructions',
      createdAt: '2026-10-06T09:00:00.000Z',
      updatedAt: '2026-10-06T09:00:00.000Z',
    });

    // P2003 FK race maps to NotFoundException; unexpected errors rethrow
    await expect(
      service.createProject(ACTOR, CLIENT_ID, { name: 'Checkout QA' }),
    ).rejects.toThrow(NotFoundException);

    // Missing parent client on list -> 404; existing client lists projects
    await expect(controller.listProjects({ clientId: CLIENT_ID }, {}, ACTOR)).rejects.toThrow(
      NotFoundException,
    );
    const listed = await controller.listProjects({ clientId: CLIENT_ID }, {}, ACTOR);
    expect(listed.items).toHaveLength(1);

    // Unexpected DB error rethrows cleanly on create
    clientFindUnique.mockResolvedValueOnce({ id: CLIENT_ID });
    await expect(
      service.createProject(ACTOR, CLIENT_ID, { name: 'Checkout QA' }),
    ).rejects.toThrow('Unexpected DB failure');

    // Detail returns matching (clientId, projectId) and throws 404 on mismatch
    const detail = await controller.getProject(
      { clientId: CLIENT_ID, projectId: PROJECT_ID },
      {},
      ACTOR,
    );
    expect(detail.id).toBe(PROJECT_ID);

    await expect(
      controller.getProject({ clientId: CLIENT_ID, projectId: PROJECT_ID }, {}, ACTOR),
    ).rejects.toThrow(NotFoundException);

    await expect(
      service.getProject(ACTOR, CLIENT_ID, 'not-a-uuid'),
    ).rejects.toThrow(RequestValidationException);
  });
});
