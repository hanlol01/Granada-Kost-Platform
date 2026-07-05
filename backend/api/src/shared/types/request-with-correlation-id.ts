import type { Request } from 'express';

export type RequestWithCorrelationId = Request & {
  correlationId?: string;
  rawBody?: Buffer;
};
