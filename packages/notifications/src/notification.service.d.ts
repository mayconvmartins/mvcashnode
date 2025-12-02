import { PrismaClient } from '@mvcashnode/db';
import { WhatsAppClient } from './whatsapp-client';
export declare class NotificationService {
    private prisma;
    private whatsappClient;
    constructor(prisma: PrismaClient, whatsappClient: WhatsAppClient);
    sendPositionAlert(positionId: number, alertType: 'OPENED' | 'CLOSED' | 'STOP_LOSS' | 'TAKE_PROFIT'): Promise<void>;
    private formatPositionAlert;
}
//# sourceMappingURL=notification.service.d.ts.map