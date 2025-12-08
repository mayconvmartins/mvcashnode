import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { SubscriptionsService } from '../subscriptions.service';
import { UserRole } from '@mvcashnode/shared';

@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(private subscriptionsService: SubscriptionsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.userId) {
      throw new ForbiddenException('Usuário não autenticado');
    }

    // Admin tem acesso total
    if (user.roles && user.roles.includes(UserRole.ADMIN)) {
      return true;
    }

    // Usuários normais (sem role subscriber) continuam funcionando normalmente
    const isSubscriber = user.roles && user.roles.includes(UserRole.SUBSCRIBER);
    if (!isSubscriber) {
      // Se não é assinante, permite acesso (usuário normal)
      return true;
    }

    // Se é assinante, verificar se tem assinatura ativa
    const isActive = await this.subscriptionsService.isSubscriptionActive(user.userId);

    if (!isActive) {
      throw new ForbiddenException('Assinatura ativa necessária para acessar este recurso');
    }

    return true;
  }
}
