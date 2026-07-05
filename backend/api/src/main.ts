import { Logger, ValidationPipe, BadRequestException } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger as PinoLogger } from 'nestjs-pino';
import type { ValidationError } from 'class-validator';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './app/filters/global-exception.filter';

function flattenValidationErrors(errors: ValidationError[], parent = ''): Record<string, string[]> {
  return errors.reduce<Record<string, string[]>>((acc, error) => {
    const propertyPath = parent ? `${parent}.${error.property}` : error.property;

    if (error.constraints) {
      acc[propertyPath] = Object.values(error.constraints);
    }

    if (error.children?.length) {
      Object.assign(acc, flattenValidationErrors(error.children, propertyPath));
    }

    return acc;
  }, {});
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true, rawBody: true });
  const config = app.get(ConfigService);

  app.useLogger(app.get(PinoLogger));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
      exceptionFactory: (errors) =>
        new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: flattenValidationErrors(errors),
        }),
    }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());

  const apiPrefix = config.getOrThrow<string>('app.apiPrefix');
  app.setGlobalPrefix(apiPrefix);

  const allowedOrigins = config.getOrThrow<string[]>('app.corsAllowedOrigins');
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  const host = config.getOrThrow<string>('app.host');
  const port = config.getOrThrow<number>('app.port');

  await app.listen(port, host);
  Logger.log(`Granada Kost API listening on http://${host}:${port}/${apiPrefix}`, 'Bootstrap');
}

void bootstrap();
