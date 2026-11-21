import { type INestApplication, ValidationPipe, type ValidationError } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import {
  type FieldValidationIssue,
  HttpExceptionFilter,
  RequestValidationException,
} from './common/http-exception.filter';
import type { ApiEnv } from './config/env.validation';
import {
  createConfiguredProxyTrust,
  TRUSTED_PROXY_CHECKER_KEY,
} from './config/trusted-proxy';

export interface ConfigureAppOptions {
  readonly mountSwaggerUi?: boolean;
}

function flattenValidationErrors(
  errors: readonly ValidationError[],
  parentPath = '',
): FieldValidationIssue[] {
  const result: FieldValidationIssue[] = [];

  for (const error of errors) {
    const fieldPath = parentPath ? `${parentPath}.${error.property}` : error.property;
    if (error.constraints) {
      const sanitizedMessages = Object.entries(error.constraints).map(([constraintKey]) => {
        if (constraintKey === 'whitelistValidation') {
          return `Property "${fieldPath}" is not permitted.`;
        }
        return `Property "${fieldPath}" failed "${constraintKey}" validation.`;
      });
      result.push({
        field: fieldPath,
        issues: sanitizedMessages,
      });
    }
    if (error.children && error.children.length > 0) {
      result.push(...flattenValidationErrors(error.children, fieldPath));
    }
  }

  return result;
}

export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('QA Evidence Hub API')
    .setDescription('Phase 1 HTTP API contract for QA Evidence Hub')
    .setVersion('0.1.0')
    .build();

  return SwaggerModule.createDocument(app, config);
}

export function serializeOpenApiDocument(document: OpenAPIObject): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}

export function configureApp(
  app: NestExpressApplication,
  env: ApiEnv,
  options?: ConfigureAppOptions,
): void {
  app.disable('x-powered-by');
  const proxyTrust = createConfiguredProxyTrust(env.trustProxy);
  app.set('trust proxy', proxyTrust.expressSetting);
  app.set(TRUSTED_PROXY_CHECKER_KEY, proxyTrust.isTrustedPeer);
  if (proxyTrust.middleware) {
    app.use(proxyTrust.middleware);
  }
  app.setGlobalPrefix('api/v1');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      forbidUnknownValues: false,
      validationError: {
        target: false,
        value: false,
      },
      exceptionFactory: (errors: ValidationError[]) =>
        new RequestValidationException(flattenValidationErrors(errors)),
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableShutdownHooks();

  const shouldMountSwagger = env.nodeEnv !== 'production' && (options?.mountSwaggerUi ?? true);
  if (shouldMountSwagger) {
    const document = buildOpenApiDocument(app);
    SwaggerModule.setup('api/docs', app, document);
  }
}
