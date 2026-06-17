import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { CORRELATION_ID_HEADER } from '../../shared/constants/correlation-id.constants';
import type { RequestWithCorrelationId } from '../../shared/types/request-with-correlation-id';

type SafeErrorResponse = {
  code?: string;
  message?: string | string[];
  details?: unknown;
};

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<RequestWithCorrelationId>();
    const response = context.getResponse<Response>();

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : undefined;

    const safeResponse =
      typeof exceptionResponse === 'object' && exceptionResponse !== null
        ? (exceptionResponse as SafeErrorResponse)
        : undefined;

    const fallbackMessage = status === 500 ? 'Internal server error' : 'Request failed';

    response.status(status).json({
      success: false,
      error: {
        code: safeResponse?.code ?? this.defaultCodeFor(status),
        message: this.normalizeMessage(safeResponse?.message) ?? fallbackMessage,
        details: safeResponse?.details,
      },
      correlation_id:
        request.correlationId ?? request.headers[CORRELATION_ID_HEADER]?.toString() ?? null,
      timestamp: new Date().toISOString(),
    });
  }

  private defaultCodeFor(status: number): string {
    const codes: Record<number, string> = {
      [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
      [HttpStatus.UNAUTHORIZED]: 'UNAUTHENTICATED',
      [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
      [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
      [HttpStatus.CONFLICT]: 'CONFLICT',
      [HttpStatus.UNPROCESSABLE_ENTITY]: 'UNPROCESSABLE_ENTITY',
      [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
      [HttpStatus.BAD_GATEWAY]: 'UPSTREAM_ERROR',
      [HttpStatus.SERVICE_UNAVAILABLE]: 'SERVICE_UNAVAILABLE',
    };

    return codes[status] ?? 'INTERNAL_SERVER_ERROR';
  }

  private normalizeMessage(message: string | string[] | undefined): string | undefined {
    if (Array.isArray(message)) {
      return message.join('; ');
    }

    return message;
  }
}
