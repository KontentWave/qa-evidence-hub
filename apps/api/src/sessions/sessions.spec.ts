import { ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedActor } from '../auth/auth.decorators';
import { RequestValidationException } from '../common/http-exception.filter';
import type { PrismaService } from '../prisma/prisma.service';
import { SessionsController } from './sessions.controller';
import { encodeSessionCursor, SessionsService } from './sessions.service';

const ACTOR: AuthenticatedActor = {
  ownerId: '11111111-2222-4333-8444-555555555555',
  loginIdentifier: 'owner@synthetic.invalid',
  timezone: 'Europe/Bratislava',
  sessionId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
};

const PROJECT_ID = '22222222-3333-4444-8555-666666666666';
const SESSION_ID = '33333333-4444-4555-8666-777777777777';
const OLDER_SESSION_ID = '33333333-4444-4555-8666-777777777776';

describe('SessionsService & SessionsController', () => {
  it('enforces actor authorization, timestamp/range validation, active-project status, bounded cursor pagination, and parent scoping', async () => {
    const fixedDate = new Date('2026-10-06T09:00:00.000Z');
    const fixedEnd = new Date('2026-10-06T10:30:00.000Z');
    const olderDate = new Date('2026-10-05T09:00:00.000Z');

    const txQueryRawMock = vi
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
      .mockResolvedValueOnce({ id: PROJECT_ID })
      .mockResolvedValueOnce({ id: PROJECT_ID });

    const listQueryRawMock = vi
      .fn()
      .mockResolvedValueOnce([
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
          startedAtCursor: '2026-10-06T09:00:00.000000Z',
          createdAtCursor: '2026-10-06T09:00:00.123456Z',
        },
        {
          id: OLDER_SESSION_ID,
          projectId: PROJECT_ID,
          purpose: 'Older session',
          startedAt: olderDate,
          endedAt: null,
          environment: null,
          device: null,
          os: null,
          browser: null,
          buildVersion: null,
          notes: null,
          createdAt: olderDate,
          updatedAt: olderDate,
          startedAtCursor: '2026-10-05T09:00:00.000000Z',
          createdAtCursor: '2026-10-05T09:00:00.000000Z',
        },
      ])
      .mockResolvedValueOnce([
        {
          id: OLDER_SESSION_ID,
          projectId: PROJECT_ID,
          purpose: 'Older session',
          startedAt: olderDate,
          endedAt: null,
          environment: null,
          device: null,
          os: null,
          browser: null,
          buildVersion: null,
          notes: null,
          createdAt: olderDate,
          updatedAt: olderDate,
          startedAtCursor: '2026-10-05T09:00:00.000000Z',
          createdAtCursor: '2026-10-05T09:00:00.000000Z',
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
      $queryRaw: txQueryRawMock,
      testSession: {
        create: sessionCreateMock,
      },
    };

    const service = new SessionsService({
      client: {
        $transaction: async <T>(cb: (tx: typeof txClient) => Promise<T>) => cb(txClient),
        $queryRaw: listQueryRawMock,
        project: { findUnique: projectFindUnique },
        testSession: {
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

    await expect(
      service.createSession(ACTOR, PROJECT_ID, {
        purpose: 'Sub-millisecond reversed range',
        startedAt: '2026-11-27T10:00:00.123900Z',
        endedAt: '2026-11-27T10:00:00.123100Z',
      }),
    ).rejects.toMatchObject({
      fieldErrors: [{ field: 'endedAt' }],
    });

    await expect(
      service.createSession(ACTOR, PROJECT_ID, {
        purpose: 'Offset sub-millisecond reversed range',
        startedAt: '2026-11-27T12:00:00.123900+02:00',
        endedAt: '2026-11-27T11:00:00.123100+01:00',
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

    // List: invalid limit/cursor -> 400, missing project -> 404, paginated pages -> items + nextCursor
    for (const badLimit of [0, 201, 1.5]) {
      await expect(
        service.listSessions(ACTOR, PROJECT_ID, { limit: badLimit }),
      ).rejects.toMatchObject({
        fieldErrors: [{ field: 'limit' }],
      });
    }

    const nonCanonicalBase64Url = 'ab'; // 'ab' decodes to 1 byte 'i', re-encodes to 'aQ' !== 'ab'
    const wrongPartCountCursor = Buffer.from('only-two|parts', 'utf8').toString('base64url');
    const badFormatCursor = Buffer.from(
      `2026-10-06T09:00:00Z|2026-10-06T09:00:00.000000Z|${SESSION_ID}`,
      'utf8',
    ).toString('base64url');
    const rolloverDateCursor = encodeSessionCursor({
      startedAt: '2026-02-31T09:00:00.000000Z',
      createdAt: '2026-10-06T09:00:00.000000Z',
      id: SESSION_ID,
    });
    const rolloverCreatedCursor = encodeSessionCursor({
      startedAt: '2026-10-06T09:00:00.000000Z',
      createdAt: '2026-02-31T09:00:00.000000Z',
      id: SESSION_ID,
    });
    const badUuidCursor = encodeSessionCursor({
      startedAt: '2026-10-06T09:00:00.000000Z',
      createdAt: '2026-10-06T09:00:00.000000Z',
      id: 'not-a-uuid',
    });

    for (const badCursor of [
      '   ',
      'bad+chars/not=base64url',
      nonCanonicalBase64Url,
      wrongPartCountCursor,
      badFormatCursor,
      rolloverDateCursor,
      rolloverCreatedCursor,
      badUuidCursor,
    ]) {
      await expect(
        service.listSessions(ACTOR, PROJECT_ID, { cursor: badCursor }),
      ).rejects.toMatchObject({
        fieldErrors: [{ field: 'cursor' }],
      });
    }

    await expect(controller.listSessions({ projectId: PROJECT_ID }, {}, ACTOR)).rejects.toThrow(
      NotFoundException,
    );

    const firstPage = await controller.listSessions({ projectId: PROJECT_ID }, { limit: 1 }, ACTOR);
    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.items[0]?.id).toBe(SESSION_ID);
    expect(typeof firstPage.nextCursor).toBe('string');

    const secondPage = await controller.listSessions(
      { projectId: PROJECT_ID },
      { cursor: firstPage.nextCursor ?? undefined },
      ACTOR,
    );
    expect(secondPage.items).toHaveLength(1);
    expect(secondPage.items[0]?.id).toBe(OLDER_SESSION_ID);
    expect(secondPage.nextCursor).toBeNull();

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
