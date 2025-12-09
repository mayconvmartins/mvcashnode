import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { UserRole } from '@mvcashnode/shared';

/**
 * Guard que permite acesso APENAS para assinantes
 * Bloqueia usuários normais (sem role subscriber)
 */
@Injectable()
export class SubscriberOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.userId) {
      throw new ForbiddenException('Usuário não autenticado');
    }

    // Admin tem acesso total
    if (user.roles && user.roles.includes(UserRole.ADMIN)) {
      return true;
    }

    // Verificar se é assinante
    const isSubscriber = user.roles && user.roles.some(
      (r: string) => r === 'subscriber' || r === UserRole.SUBSCRIBER
    );

    if (!isSubscriber) {
      throw new ForbiddenException('Este recurso é exclusivo para assinantes');
    }

    return true;
  }
}
