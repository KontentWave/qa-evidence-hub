import {
  type ArgumentsHost,
  BadRequestException,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';

export interface FieldValidationIssue {
  readonly field: string;
  readonly issues: readonly string[];
}

export interface ApiErrorBody {
  readonly code: string;
  readonly message: string;
  readonly fieldErrors?: readonly FieldValidationIssue[];
}

export class RequestValidationException extends BadRequestException {
  public readonly fieldErrors: readonly FieldValidationIssue[];

  constructor(fieldErrors: readonly FieldValidationIssue[]) {
    super('Request validation failed.');
    this.fieldErrors = fieldErrors;
  }
}

export class LoginThrottledException extends HttpException {
  public readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super('Too many requests.', HttpStatus.TOO_MANY_REQUESTS);
    this.retryAfterSeconds = Math.max(1, Math.ceil(retryAfterSeconds));
  }
}

function mapStatusToErrorCode(status: number): { code: string; fallbackMessage: string } {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return { code: 'BAD_REQUEST', fallbackMessage: 'Invalid request.' };
    case HttpStatus.UNAUTHORIZED:
      return { code: 'UNAUTHORIZED', fallbackMessage: 'Authentication is required.' };
    case HttpStatus.FORBIDDEN:
      return { code: 'FORBIDDEN', fallbackMessage: 'Access denied.' };
    case HttpStatus.NOT_FOUND:
      return { code: 'NOT_FOUND', fallbackMessage: 'Requested resource was not found.' };
    case HttpStatus.CONFLICT:
      return { code: 'CONFLICT', fallbackMessage: 'Request conflicts with current resource state.' };
    case HttpStatus.PAYLOAD_TOO_LARGE:
      return { code: 'PAYLOAD_TOO_LARGE', fallbackMessage: 'Request payload exceeds the maximum allowed size.' };
    case HttpStatus.TOO_MANY_REQUESTS:
      return { code: 'TOO_MANY_REQUESTS', fallbackMessage: 'Too many requests.' };
    case HttpStatus.SERVICE_UNAVAILABLE:
      return { code: 'SERVICE_UNAVAILABLE', fallbackMessage: 'Service is temporarily unavailable.' };
    default:
      return { code: 'INTERNAL_ERROR', fallbackMessage: 'An unexpected error occurred.' };
  }
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  public catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (!response.getHeader('Cache-Control')) {
      response.setHeader('Cache-Control', 'no-store');
    }
    response.setHeader('X-Content-Type-Options', 'nosniff');

    if (exception instanceof LoginThrottledException) {
      response.setHeader('Retry-After', String(exception.retryAfterSeconds));
    }

    if (exception instanceof RequestValidationException) {
      const body: ApiErrorBody = {
        code: 'BAD_REQUEST',
        message: 'Request validation failed.',
        fieldErrors: exception.fieldErrors,
      };
      response.status(HttpStatus.BAD_REQUEST).json(body);
      return;
    }

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    const { code, fallbackMessage } = mapStatusToErrorCode(status);

    // Never echo raw request paths, queries, provider details, or internal stack messages.
    const body: ApiErrorBody = {
      code,
      message: fallbackMessage,
    };

    response.status(status).json(body);
  }
}
