import createClient, { type Client, type ClientOptions } from 'openapi-fetch';
import type { components, paths } from './generated/openapi.js';

export type { components, paths };

export type LivenessResponse = components['schemas']['LivenessResponseDto'];
export type ReadinessOkResponse = components['schemas']['ReadinessOkResponseDto'];
export type ReadinessUnavailableResponse = components['schemas']['ReadinessUnavailableResponseDto'];
export type CsrfTokenResponse = components['schemas']['CsrfTokenResponseDto'];
export type LoginRequest = components['schemas']['LoginRequestDto'];
export type LoginResponse = components['schemas']['LoginResponseDto'];
export type OwnerSummary = components['schemas']['OwnerSummaryDto'];
export type SessionStatusResponse = components['schemas']['SessionStatusResponseDto'];
export type LogoutResponse = components['schemas']['LogoutResponseDto'];
export type CreateClientRequest = components['schemas']['CreateClientDto'];
export type ClientSummary = components['schemas']['ClientDto'];
export type ClientListResponse = components['schemas']['ClientListResponseDto'];
export type CreateProjectRequest = components['schemas']['CreateProjectDto'];
export type ProjectSummary = components['schemas']['ProjectDto'];
export type ProjectListResponse = components['schemas']['ProjectListResponseDto'];
export type CreateSessionRequest = components['schemas']['CreateSessionDto'];
export type TestSessionSummary = components['schemas']['SessionDto'];
export type TestSessionListResponse = components['schemas']['SessionListResponseDto'];

export interface CreateApiClientOptions {
  readonly baseUrl: string;
  readonly fetch?: ClientOptions['fetch'];
  readonly headers?: ClientOptions['headers'];
}

export type QaEvidenceHubApiClient = Client<paths>;

export function createApiClient(options: CreateApiClientOptions): QaEvidenceHubApiClient {
  return createClient<paths>({
    baseUrl: options.baseUrl.replace(/\/+$/, ''),
    fetch: options.fetch,
    headers: options.headers,
  });
}
