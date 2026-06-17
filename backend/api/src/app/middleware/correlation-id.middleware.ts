import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { NextFunction, Response } from 'express';
import { CORRELATION_ID_HEADER } from '../../shared/constants/correlation-id.constants';
import type { RequestWithCorrelationId } from '../../shared/types/request-with-correlation-id';

const VALID_CORRELATION_ID = /^[a-zA-Z0-9._:-]{8,128}$/;

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(request: RequestWithCorrelationId, response: Response, next: NextFunction): void {
    const incoming = request.headers[CORRELATION_ID_HEADER]?.toString();
    const correlationId =
      incoming && VALID_CORRELATION_ID.test(incoming) ? incoming : randomUUID();

    request.correlationId = correlationId;
    request.headers[CORRELATION_ID_HEADER] = correlationId;
    response.setHeader(CORRELATION_ID_HEADER, correlationId);

    next();
  }
}
