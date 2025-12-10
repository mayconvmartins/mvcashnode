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
        const responseObj = exceptionResponse as any;
        // Tratar erros de validação do ValidationPipe (message pode ser array)
        if (Array.isArray(responseObj.message)) {
          // Se for array de mensagens de validação, juntar em uma string
          message = responseObj.message.join(', ');
        } else if (responseObj.message) {
          message = responseObj.message;
        } else {
          message = responseObj;
        }
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

    // Garantir que message seja sempre uma string
    let finalMessage: string;
    if (typeof message === 'string') {
      finalMessage = message;
    } else if (Array.isArray(message)) {
      finalMessage = message.join(', ');
    } else if (message && typeof message === 'object' && 'message' in message) {
      finalMessage = Array.isArray((message as any).message) 
        ? (message as any).message.join(', ')
        : String((message as any).message || 'Error');
    } else {
      finalMessage = 'Error';
    }

    response.status(status).json({
      error: HttpStatus[status] || 'INTERNAL_SERVER_ERROR',
      message: finalMessage,
      statusCode: status,
      timestamp: new Date().toISOString(),
    });
  }
}

