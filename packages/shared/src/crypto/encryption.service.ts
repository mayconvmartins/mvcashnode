import { createCipheriv, createDecipheriv, randomBytes, scrypt } from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(scrypt);

export interface EncryptionConfig {
  algorithm?: string;
  keyLength?: number;
  ivLength?: number;
}

export class EncryptionService {
  private readonly algorithm: string;
  private readonly keyLength: number;
  private readonly ivLength: number;
  private readonly key: Buffer;

  constructor(encryptionKey: string, config: EncryptionConfig = {}) {
    this.algorithm = config.algorithm || 'aes-256-gcm';
    this.keyLength = config.keyLength || 32;
    this.ivLength = config.ivLength || 16;

    if (!encryptionKey || encryptionKey.length < 32) {
      throw new Error('Encryption key must be at least 32 bytes');
    }

    // Derive key from provided key string
    this.key = Buffer.from(encryptionKey.slice(0, this.keyLength), 'utf8');
  }

  async encrypt(plaintext: string): Promise<string> {
    try {
      const iv = randomBytes(this.ivLength);
      const cipher = createCipheriv(this.algorithm, this.key, iv);

      let encrypted = cipher.update(plaintext, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      const authTag = (cipher as any).getAuthTag();

      // Format: iv:authTag:encrypted
      return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
    } catch (error) {
      throw new Error(`Encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async decrypt(ciphertext: string): Promise<string> {
    try {
      const parts = ciphertext.split(':');
      if (parts.length !== 3) {
        throw new Error('Invalid ciphertext format');
      }

      const [ivHex, authTagHex, encrypted] = parts;
      const iv = Buffer.from(ivHex, 'hex');
      const authTag = Buffer.from(authTagHex, 'hex');

      const decipher = createDecipheriv(this.algorithm, this.key, iv);
      (decipher as any).setAuthTag(authTag);

      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      throw new Error(`Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  static generateKey(length: number = 32): string {
    return randomBytes(length).toString('hex');
  }
}

