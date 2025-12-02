export interface WhatsAppConfig {
    apiUrl: string;
    apiKey?: string;
    instanceName: string;
}
export declare class WhatsAppClient {
    private client;
    constructor(config: WhatsAppConfig);
    sendMessage(phone: string, message: string): Promise<void>;
}
//# sourceMappingURL=whatsapp-client.d.ts.map