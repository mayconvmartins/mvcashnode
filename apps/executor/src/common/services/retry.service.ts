import { Logger } from '@nestjs/common';

/**
 * Serviço para retry com backoff exponencial
 * ✅ BUG-ALTO-003 FIX: Implementar retry para erros de rede
 */
export class RetryService {
  private readonly logger = new Logger(RetryService.name);

  /**
   * Executa uma função com retry automático para erros recuperáveis
   * @param operation Função a ser executada
   * @param options Opções de retry
   * @returns Resultado da operação
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    options: {
      maxRetries?: number;
      baseDelay?: number;
      maxDelay?: number;
      retryableErrors?: string[];
      onRetry?: (attempt: number, error: Error) => void;
    } = {}
  ): Promise<T> {
    const {
      maxRetries = 3,
      baseDelay = 1000,
      maxDelay = 30000,
      retryableErrors = ['NETWORK_ERROR', 'TIMEOUT', 'RATE_LIMIT', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED'],
      onRetry,
    } = options;

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;

        // Verificar se o erro é recuperável
        const errorMessage = error?.message || '';
        const errorCode = error?.code || '';
        const isRetryable = retryableErrors.some(
          (retryableError) =>
            errorMessage.includes(retryableError) ||
            errorCode.includes(retryableError) ||
            errorMessage.toLowerCase().includes('network') ||
            errorMessage.toLowerCase().includes('timeout') ||
            errorMessage.toLowerCase().includes('rate limit') ||
            errorMessage.toLowerCase().includes('econnreset') ||
            errorMessage.toLowerCase().includes('etimedout') ||
            errorMessage.toLowerCase().includes('enotfound') ||
            errorMessage.toLowerCase().includes('econnrefused')
        );

        if (!isRetryable || attempt >= maxRetries) {
          // Erro não recuperável ou esgotou tentativas
          throw error;
        }

        // Calcular delay com backoff exponencial
        const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);

        this.logger.warn(
          `[RetryService] Tentativa ${attempt}/${maxRetries} falhou. Tentando novamente em ${delay}ms...`,
          {
            error: errorMessage,
            errorCode,
            attempt,
            delay,
          }
        );

        if (onRetry) {
          onRetry(attempt, error);
        }

        // Aguardar antes de tentar novamente
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    // Se chegou aqui, esgotou todas as tentativas
    if (lastError) {
      throw lastError;
    }

    throw new Error('Retry esgotou todas as tentativas sem sucesso');
  }

  /**
   * Verifica se um erro é recuperável (pode ser tentado novamente)
   */
  isRetryableError(error: any): boolean {
    const errorMessage = error?.message || '';
    const errorCode = error?.code || '';

    const retryablePatterns = [
      'NETWORK_ERROR',
      'TIMEOUT',
      'RATE_LIMIT',
      'ECONNRESET',
      'ETIMEDOUT',
      'ENOTFOUND',
      'ECONNREFUSED',
      'network',
      'timeout',
      'rate limit',
      'econnreset',
      'etimedout',
      'enotfound',
      'econnrefused',
    ];

    return retryablePatterns.some(
      (pattern) =>
        errorMessage.toLowerCase().includes(pattern.toLowerCase()) ||
        errorCode.toLowerCase().includes(pattern.toLowerCase())
    );
  }
}

