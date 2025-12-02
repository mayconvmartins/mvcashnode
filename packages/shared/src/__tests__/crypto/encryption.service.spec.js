"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const encryption_service_1 = require("../../crypto/encryption.service");
describe('EncryptionService', () => {
    const encryptionKey = 'a'.repeat(32);
    let service;
    beforeEach(() => {
        service = new encryption_service_1.EncryptionService(encryptionKey);
    });
    describe('encrypt', () => {
        it('should encrypt plaintext', async () => {
            const plaintext = 'sensitive-data';
            const encrypted = await service.encrypt(plaintext);
            expect(encrypted).toBeDefined();
            expect(encrypted).not.toBe(plaintext);
            expect(encrypted.split(':')).toHaveLength(3);
        });
        it('should produce different ciphertext for same plaintext', async () => {
            const plaintext = 'sensitive-data';
            const encrypted1 = await service.encrypt(plaintext);
            const encrypted2 = await service.encrypt(plaintext);
            expect(encrypted1).not.toBe(encrypted2);
        });
    });
    describe('decrypt', () => {
        it('should decrypt ciphertext to original plaintext', async () => {
            const plaintext = 'sensitive-data';
            const encrypted = await service.encrypt(plaintext);
            const decrypted = await service.decrypt(encrypted);
            expect(decrypted).toBe(plaintext);
        });
        it('should throw error for invalid ciphertext format', async () => {
            await expect(service.decrypt('invalid')).rejects.toThrow('Invalid ciphertext format');
        });
    });
    describe('generateKey', () => {
        it('should generate a key of specified length', () => {
            const key = encryption_service_1.EncryptionService.generateKey(32);
            expect(key).toBeDefined();
            expect(Buffer.from(key, 'hex').length).toBe(32);
        });
    });
});
//# sourceMappingURL=encryption.service.spec.js.map