import { createCorrelationId } from '@bsbe/shared';
import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

export const correlationIdHeader = 'x-correlation-id';

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(request: Request, response: Response, next: NextFunction): void {
    const candidate = request.header(correlationIdHeader);
    const correlationId = createCorrelationId(candidate);
    request.headers[correlationIdHeader] = correlationId;
    response.setHeader(correlationIdHeader, correlationId);
    next();
  }
}
