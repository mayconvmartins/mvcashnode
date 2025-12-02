import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | object = 'Internal server error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      
      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        message = (exceptionResponse as any).message || exceptionResponse;
      }
    } else if (exception instanceof Error) {
      // Log unexpected errors but don't expose internal details
      console.error('Unexpected error:', exception);
      
      // Try to map common error messages to appropriate status codes
      const errorMessage = exception.message.toLowerCase();
      
      if (errorMessage.includes('not found') || errorMessage.includes('não encontrado')) {
        status = HttpStatus.NOT_FOUND;
        message = 'Recurso não encontrado';
      } else if (errorMessage.includes('unauthorized') || errorMessage.includes('invalid credentials') || errorMessage.includes('credenciais')) {
        status = HttpStatus.UNAUTHORIZED;
        message = 'Não autorizado';
      } else if (errorMessage.includes('forbidden') || errorMessage.includes('proibido')) {
        status = HttpStatus.FORBIDDEN;
        message = 'Acesso negado';
      } else if (errorMessage.includes('bad request') || errorMessage.includes('inválido')) {
        status = HttpStatus.BAD_REQUEST;
        message = 'Requisição inválida';
      } else {
        message = 'Erro interno do servidor';
      }
    }

    response.status(status).json({
      error: HttpStatus[status] || 'INTERNAL_SERVER_ERROR',
      message: typeof message === 'string' ? message : (message as any).message || 'Error',
      statusCode: status,
      timestamp: new Date().toISOString(),
    });
  }
}

