"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EncryptionService = void 0;
const crypto_1 = require("crypto");
class EncryptionService {
    algorithm;
    keyLength;
    ivLength;
    key;
    constructor(encryptionKey, config = {}) {
        this.algorithm = config.algorithm || 'aes-256-gcm';
        this.keyLength = config.keyLength || 32;
        this.ivLength = config.ivLength || 16;
        if (!encryptionKey || encryptionKey.length < 32) {
            throw new Error('Encryption key must be at least 32 bytes');
        }
        this.key = Buffer.from(encryptionKey.slice(0, this.keyLength), 'utf8');
    }
    async encrypt(plaintext) {
        try {
            const iv = (0, crypto_1.randomBytes)(this.ivLength);
            const cipher = (0, crypto_1.createCipheriv)(this.algorithm, this.key, iv);
            let encrypted = cipher.update(plaintext, 'utf8', 'hex');
            encrypted += cipher.final('hex');
            const authTag = cipher.getAuthTag();
            return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
        }
        catch (error) {
            throw new Error(`Encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async decrypt(ciphertext) {
        try {
            const parts = ciphertext.split(':');
            if (parts.length !== 3) {
                throw new Error('Invalid ciphertext format');
            }
            const [ivHex, authTagHex, encrypted] = parts;
            const iv = Buffer.from(ivHex, 'hex');
            const authTag = Buffer.from(authTagHex, 'hex');
            const decipher = (0, crypto_1.createDecipheriv)(this.algorithm, this.key, iv);
            decipher.setAuthTag(authTag);
            let decrypted = decipher.update(encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            return decrypted;
        }
        catch (error) {
            throw new Error(`Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    static generateKey(length = 32) {
        return (0, crypto_1.randomBytes)(length).toString('hex');
    }
}
exports.EncryptionService = EncryptionService;
//# sourceMappingURL=encryption.service.js.map