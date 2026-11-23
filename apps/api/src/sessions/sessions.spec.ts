import { ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedActor } from '../auth/auth.decorators';
import { RequestValidationException } from '../common/http-exception.filter';
import type { PrismaService } from '../prisma/prisma.service';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';

const ACTOR: AuthenticatedActor = {
  ownerId: '11111111-2222-4333-8444-555555555555',
  loginIdentifier: 'owner@synthetic.invalid',
  timezone: 'Europe/Bratislava',
  sessionId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
};

const PROJECT_ID = '22222222-3333-4444-8555-666666666666';
const SESSION_ID = '33333333-4444-4555-8666-777777777777';

describe('SessionsService & SessionsController', () => {
  it('enforces actor authorization, timestamp/range validation, active-project status, and parent scoping', async () => {
    const fixedDate = new Date('2026-10-06T09:00:00.000Z');
    const fixedEnd = new Date('2026-10-06T10:30:00.000Z');

    const queryRawMock = vi
      .fn()
      .mockResolvedValueOnce([]) // missing parent project
      .mockResolvedValueOnce([{ id: PROJECT_ID, status: 'Archived' }]) // archived project
      .mockResolvedValueOnce([{ id: PROJECT_ID, status: 'Active' }]) // open session (endedAt null)
      .mockResolvedValueOnce([{ id: PROJECT_ID, status: 'Active' }]); // closed session (endedAt >= startedAt)

    const sessionCreateMock = vi
      .fn()
      .mockResolvedValueOnce({
        id: SESSION_ID,
        projectId: PROJECT_ID,
        purpose: 'Checkout regression',
        startedAt: fixedDate,
        endedAt: null,
        environment: 'staging',
        device: null,
        os: 'Linux',
        browser: 'Firefox',
        buildVersion: '1.0.0',
        notes: null,
        createdAt: fixedDate,
        updatedAt: fixedDate,
      })
      .mockResolvedValueOnce({
        id: SESSION_ID,
        projectId: PROJECT_ID,
        purpose: 'Closed regression',
        startedAt: fixedDate,
        endedAt: fixedEnd,
        environment: null,
        device: null,
        os: null,
        browser: null,
        buildVersion: null,
        notes: 'Notes',
        createdAt: fixedDate,
        updatedAt: fixedDate,
      });

    const projectFindUnique = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: PROJECT_ID });

    const sessionFindMany = vi.fn(async () => [
      {
        id: SESSION_ID,
        projectId: PROJECT_ID,
        purpose: 'Checkout regression',
        startedAt: fixedDate,
        endedAt: null,
        environment: null,
        device: null,
        os: null,
        browser: null,
        buildVersion: null,
        notes: null,
        createdAt: fixedDate,
        updatedAt: fixedDate,
      },
    ]);

    const sessionFindFirst = vi
      .fn()
      .mockResolvedValueOnce({
        id: SESSION_ID,
        projectId: PROJECT_ID,
        purpose: 'Checkout regression',
        startedAt: fixedDate,
        endedAt: fixedEnd,
        environment: null,
        device: null,
        os: null,
        browser: null,
        buildVersion: null,
        notes: null,
        createdAt: fixedDate,
        updatedAt: fixedDate,
      })
      .mockResolvedValueOnce(null);

    const txClient = {
      $queryRaw: queryRawMock,
      testSession: {
        create: sessionCreateMock,
      },
    };

    const service = new SessionsService({
      client: {
        $transaction: async <T>(cb: (tx: typeof txClient) => Promise<T>) => cb(txClient),
        project: { findUnique: projectFindUnique },
        testSession: {
          findMany: sessionFindMany,
          findFirst: sessionFindFirst,
        },
      },
    } as unknown as PrismaService);

    const controller = new SessionsController(service);

    await expect(
      service.createSession(undefined, PROJECT_ID, {
        purpose: 'Test',
        startedAt: '2026-10-06T09:00:00Z',
      }),
    ).rejects.toThrow(UnauthorizedException);
    await expect(service.listSessions(undefined, PROJECT_ID)).rejects.toThrow(
      UnauthorizedException,
    );
    await expect(service.getSession(undefined, PROJECT_ID, SESSION_ID)).rejects.toThrow(
      UnauthorizedException,
    );

    // Invalid startedAt, invalid endedAt, and endedAt < startedAt throw field-scoped RequestValidationException
    await expect(
      service.createSession(ACTOR, PROJECT_ID, {
        purpose: 'Test',
        startedAt: 'not-a-timestamp',
      }),
    ).rejects.toMatchObject({
      fieldErrors: [{ field: 'startedAt' }],
    });

    await expect(
      service.createSession(ACTOR, PROJECT_ID, {
        purpose: 'Test',
        startedAt: '2026-10-06T09:00:00Z',
        endedAt: '2026-02-31T10:00:00Z',
      }),
    ).rejects.toMatchObject({
      fieldErrors: [{ field: 'endedAt' }],
    });

    await expect(
      service.createSession(ACTOR, PROJECT_ID, {
        purpose: 'Test',
        startedAt: '2026-10-06T10:00:00Z',
        endedAt: '2026-10-06T09:59:59Z',
      }),
    ).rejects.toMatchObject({
      fieldErrors: [{ field: 'endedAt' }],
    });

    // Missing parent project -> 404; archived parent project -> 409 Conflict
    await expect(
      controller.createSession(
        { projectId: PROJECT_ID },
        {},
        { purpose: 'Test', startedAt: '2026-10-06T09:00:00Z' },
        ACTOR,
      ),
    ).rejects.toThrow(NotFoundException);

    await expect(
      controller.createSession(
        { projectId: PROJECT_ID },
        {},
        { purpose: 'Test', startedAt: '2026-10-06T09:00:00Z' },
        ACTOR,
      ),
    ).rejects.toThrow(ConflictException);

    // Valid open session (blank endedAt normalized to null)
    const openSession = await controller.createSession(
      { projectId: PROJECT_ID },
      {},
      {
        purpose: '  Checkout regression  ',
        startedAt: '2026-10-06T09:00:00Z',
        endedAt: '   ',
        environment: 'staging',
        os: 'Linux',
        browser: 'Firefox',
        buildVersion: '1.0.0',
      },
      ACTOR,
    );
    expect(openSession.endedAt).toBeNull();
    expect(openSession.purpose).toBe('Checkout regression');

    // Valid closed session (endedAt >= startedAt)
    const closedSession = await controller.createSession(
      { projectId: PROJECT_ID },
      {},
      {
        purpose: 'Closed regression',
        startedAt: '2026-10-06T09:00:00Z',
        endedAt: '2026-10-06T10:30:00Z',
        notes: 'Notes',
      },
      ACTOR,
    );
    expect(closedSession.endedAt).toBe('2026-10-06T10:30:00.000Z');

    // List: missing project -> 404, existing project -> items
    await expect(controller.listSessions({ projectId: PROJECT_ID }, {}, ACTOR)).rejects.toThrow(
      NotFoundException,
    );
    const listed = await controller.listSessions({ projectId: PROJECT_ID }, {}, ACTOR);
    expect(listed.items).toHaveLength(1);

    // Get: matching (projectId, sessionId) -> detail, mismatch -> 404, bad UUID -> 400
    const detail = await controller.getSession(
      { projectId: PROJECT_ID, sessionId: SESSION_ID },
      {},
      ACTOR,
    );
    expect(detail.endedAt).toBe('2026-10-06T10:30:00.000Z');

    await expect(
      controller.getSession({ projectId: PROJECT_ID, sessionId: SESSION_ID }, {}, ACTOR),
    ).rejects.toThrow(NotFoundException);

    await expect(service.getSession(ACTOR, PROJECT_ID, 'bad-id')).rejects.toThrow(
      RequestValidationException,
    );
  });
});
