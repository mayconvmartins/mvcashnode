import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface Response<T> {
  data: T;
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, Response<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<Response<T>> {
    return next.handle().pipe(
      map((data) => {
        // Se data já tem pagination (PaginatedResponse), retornar como está
        // O formato esperado é { data: [...], pagination: {...} }
        if (data && typeof data === 'object' && 'pagination' in data && 'data' in data) {
          // Já está no formato correto, retornar sem envolver
          return data as any;
        }
        // Se data é um array, envolver em { data: [...] }
        if (Array.isArray(data)) {
          return { data };
        }
        // Se data é um objeto sem pagination, envolver em { data: {...} }
        if (data && typeof data === 'object') {
          return { data };
        }
        // Caso contrário, envolver em { data: ... }
        return { data };
      })
    );
  }
}

