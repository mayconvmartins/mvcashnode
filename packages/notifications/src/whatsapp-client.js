"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WhatsAppClient = void 0;
const axios_1 = __importDefault(require("axios"));
class WhatsAppClient {
    client;
    constructor(config) {
        this.client = axios_1.default.create({
            baseURL: `${config.apiUrl}/instance/${config.instanceName}`,
            headers: {
                'Content-Type': 'application/json',
                ...(config.apiKey && { 'apikey': config.apiKey }),
            },
        });
    }
    async sendMessage(phone, message) {
        try {
            await this.client.post('/send-text', {
                number: phone,
                text: message,
            });
        }
        catch (error) {
            throw new Error(`Failed to send WhatsApp message: ${error.message}`);
        }
    }
}
exports.WhatsAppClient = WhatsAppClient;
//# sourceMappingURL=whatsapp-client.js.map