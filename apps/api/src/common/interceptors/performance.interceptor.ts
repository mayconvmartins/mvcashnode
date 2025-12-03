import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class PerformanceInterceptor implements NestInterceptor {
  private readonly logger = new Logger(PerformanceInterceptor.name);
  private readonly SLOW_QUERY_THRESHOLD = 500; // 500ms
  private readonly VERY_SLOW_QUERY_THRESHOLD = 2000; // 2 segundos

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url, route } = request;
    const startTime = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - startTime;
          const routePath = route?.path || url;

          // Adicionar header de tempo de resposta
          const response = context.switchToHttp().getResponse();
          response.setHeader('X-Response-Time', `${duration}ms`);

          // Log de queries lentas
          if (duration > this.VERY_SLOW_QUERY_THRESHOLD) {
            this.logger.warn(
              `🐌 Query MUITO LENTA: ${method} ${routePath} - ${duration}ms`,
            );
          } else if (duration > this.SLOW_QUERY_THRESHOLD) {
            this.logger.warn(
              `⚠️ Query lenta: ${method} ${routePath} - ${duration}ms`,
            );
          } else if (process.env.LOG_PERFORMANCE === 'true') {
            // Log detalhado apenas se habilitado via env
            this.logger.debug(
              `✅ ${method} ${routePath} - ${duration}ms`,
            );
          }
        },
        error: (error) => {
          const duration = Date.now() - startTime;
          const routePath = route?.path || url;
          
          this.logger.error(
            `❌ Erro em ${method} ${routePath} após ${duration}ms: ${error.message}`,
          );
        },
      }),
    );
  }
}

