export interface EncryptionConfig {
    algorithm?: string;
    keyLength?: number;
    ivLength?: number;
}
export declare class EncryptionService {
    private readonly algorithm;
    private readonly keyLength;
    private readonly ivLength;
    private readonly key;
    constructor(encryptionKey: string, config?: EncryptionConfig);
    encrypt(plaintext: string): Promise<string>;
    decrypt(ciphertext: string): Promise<string>;
    static generateKey(length?: number): string;
}
//# sourceMappingURL=encryption.service.d.ts.map