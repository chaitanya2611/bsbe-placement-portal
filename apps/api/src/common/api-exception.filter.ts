import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { correlationIdHeader } from './correlation-id.middleware';

interface HttpExceptionBody {
  code?: string;
  message?: string | string[];
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();
    const isHttpException = exception instanceof HttpException;
    const statusCode = isHttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const exceptionResponse = isHttpException ? exception.getResponse() : undefined;
    const body =
      typeof exceptionResponse === 'object' && exceptionResponse !== null
        ? (exceptionResponse as HttpExceptionBody)
        : undefined;
    const rawMessage = body?.message;
    const message =
      statusCode >= 500
        ? 'The service could not complete the request'
        : Array.isArray(rawMessage)
          ? rawMessage.join('; ')
          : (rawMessage ??
            (typeof exceptionResponse === 'string' ? exceptionResponse : 'Request failed'));
    const correlationId = String(request.headers[correlationIdHeader] ?? 'unavailable');

    if (statusCode >= 500) {
      const error = exception instanceof Error ? exception : new Error(String(exception));
      this.logger.error(
        `${request.method} ${request.originalUrl} failed (${correlationId}): ${error.message}`,
        error.stack,
      );
    }

    response.status(statusCode).json({
      statusCode,
      code: body?.code ?? (isHttpException ? 'HTTP_ERROR' : 'INTERNAL_ERROR'),
      message,
      correlationId,
      timestamp: new Date().toISOString(),
      path: request.originalUrl,
    });
  }
}
