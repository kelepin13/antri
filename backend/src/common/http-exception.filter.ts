import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';

/**
 * One error shape for every failure, so the mobile app can switch on `code`:
 *   { statusCode, code, message, ...details }
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Error');

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();

    if (!(exception instanceof HttpException)) {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
      res.status(500).json({ statusCode: 500, code: 'INTERNAL_ERROR', message: 'Something went wrong' });
      return;
    }

    const statusCode = exception.getStatus();
    const body = exception.getResponse();
    const payload: Record<string, unknown> =
      typeof body === 'string' ? { message: body } : { ...(body as Record<string, unknown>) };
    delete payload.statusCode;
    delete payload.error;

    // class-validator returns an array of messages.
    if (Array.isArray(payload.message)) {
      payload.details = payload.message;
      payload.message = 'Request validation failed';
      payload.code ??= 'VALIDATION_FAILED';
    }
    payload.code ??= HttpStatus[statusCode] ?? 'ERROR';

    res.status(statusCode).json({ statusCode, ...payload });
  }
}
