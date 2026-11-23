import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Client } from '@prisma/client';
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
import type { ClientDto } from './clients.dto';

export interface CreateClientInput {
  readonly name: string;
  readonly notes?: string | null;
}

function toClientDto(row: Client): ClientDto {
  return {
    id: row.id,
    name: row.name,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class ClientsService {
  constructor(@Inject(PrismaService) private readonly prismaService: PrismaService) {}

  public async createClient(
    actor: AuthenticatedActor | undefined,
    input: CreateClientInput,
  ): Promise<ClientDto> {
    assertAuthorizedDomainActor(actor);
    const name = normalizeRequiredTextField('name', input.name, SHORT_TEXT_MAX_LENGTH);
    const notes = normalizeOptionalTextField('notes', input.notes, LONG_TEXT_MAX_LENGTH);

    const created = await this.prismaService.client.client.create({
      data: {
        name,
        notes,
      },
    });
    return toClientDto(created);
  }

  public async listClients(
    actor: AuthenticatedActor | undefined,
  ): Promise<{ readonly items: ClientDto[] }> {
    assertAuthorizedDomainActor(actor);
    const rows = await this.prismaService.client.client.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: DEFAULT_DOMAIN_LIST_LIMIT,
    });
    return { items: rows.map(toClientDto) };
  }

  public async getClient(
    actor: AuthenticatedActor | undefined,
    clientId: string,
  ): Promise<ClientDto> {
    assertAuthorizedDomainActor(actor);
    const normalizedClientId = assertValidUuidField('clientId', clientId);

    const row = await this.prismaService.client.client.findUnique({
      where: { id: normalizedClientId },
    });
    if (!row) {
      throw new NotFoundException();
    }
    return toClientDto(row);
  }
}
