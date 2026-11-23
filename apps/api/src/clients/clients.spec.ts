import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedActor } from '../auth/auth.decorators';
import { RequestValidationException } from '../common/http-exception.filter';
import type { PrismaService } from '../prisma/prisma.service';
import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';

const ACTOR: AuthenticatedActor = {
  ownerId: '11111111-2222-4333-8444-555555555555',
  loginIdentifier: 'owner@synthetic.invalid',
  timezone: 'Europe/Bratislava',
  sessionId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
};

const SAMPLE_CLIENT_ID = '22222222-3333-4444-8555-666666666666';

describe('ClientsService & ClientsController', () => {
  it('enforces explicit actor authorization across create, list, and detail operations', async () => {
    const prismaMock = {
      client: {
        client: {
          create: vi.fn(),
          findMany: vi.fn(),
          findUnique: vi.fn(),
        },
      },
    } as unknown as PrismaService;

    const service = new ClientsService(prismaMock);

    await expect(service.createClient(undefined, { name: 'Example Client' })).rejects.toThrow(
      UnauthorizedException,
    );
    await expect(service.listClients(undefined)).rejects.toThrow(UnauthorizedException);
    await expect(service.getClient(undefined, SAMPLE_CLIENT_ID)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('creates, lists, and fetches clients with trimmed values, ISO UTC timestamps, and 404 on missing ID', async () => {
    const fixedDate = new Date('2026-10-06T09:00:00.000Z');
    const createMock = vi.fn(async ({ data }: { data: { name: string; notes: string | null } }) => ({
      id: SAMPLE_CLIENT_ID,
      name: data.name,
      notes: data.notes,
      createdAt: fixedDate,
      updatedAt: fixedDate,
    }));
    const findManyMock = vi.fn(async () => [
      {
        id: SAMPLE_CLIENT_ID,
        name: 'Example Client',
        notes: null,
        createdAt: fixedDate,
        updatedAt: fixedDate,
      },
    ]);
    const findUniqueMock = vi
      .fn()
      .mockResolvedValueOnce({
        id: SAMPLE_CLIENT_ID,
        name: 'Example Client',
        notes: 'Notes',
        createdAt: fixedDate,
        updatedAt: fixedDate,
      })
      .mockResolvedValueOnce(null);

    const service = new ClientsService({
      client: {
        client: {
          create: createMock,
          findMany: findManyMock,
          findUnique: findUniqueMock,
        },
      },
    } as unknown as PrismaService);

    const controller = new ClientsController(service);

    const created = await controller.createClient(
      {},
      { name: '  Example Client  ', notes: '   ' },
      ACTOR,
    );
    expect(created).toEqual({
      id: SAMPLE_CLIENT_ID,
      name: 'Example Client',
      notes: null,
      createdAt: '2026-10-06T09:00:00.000Z',
      updatedAt: '2026-10-06T09:00:00.000Z',
    });

    const listed = await controller.listClients({}, ACTOR);
    expect(listed.items).toHaveLength(1);

    const detail = await controller.getClient({ clientId: SAMPLE_CLIENT_ID }, {}, ACTOR);
    expect(detail.notes).toBe('Notes');

    await expect(
      controller.getClient({ clientId: SAMPLE_CLIENT_ID }, {}, ACTOR),
    ).rejects.toThrow(NotFoundException);

    await expect(service.createClient(ACTOR, { name: '   ' })).rejects.toThrow(
      RequestValidationException,
    );
    await expect(service.getClient(ACTOR, 'invalid-uuid')).rejects.toThrow(
      RequestValidationException,
    );
  });
});
