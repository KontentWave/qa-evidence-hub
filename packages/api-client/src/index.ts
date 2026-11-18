import createClient, { type Client, type ClientOptions } from 'openapi-fetch';
import type { components, paths } from './generated/openapi.js';

export type { components, paths };

export type LivenessResponse = components['schemas']['LivenessResponseDto'];
export type ReadinessOkResponse = components['schemas']['ReadinessOkResponseDto'];
export type ReadinessUnavailableResponse = components['schemas']['ReadinessUnavailableResponseDto'];

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
