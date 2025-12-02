import { AuthService } from '../auth.service';
import { PrismaClient } from '@mvcashnode/db';
import { EncryptionService } from '@mvcashnode/shared';

describe('AuthService', () => {
  let authService: AuthService;
  let prisma: jest.Mocked<PrismaClient>;
  let encryptionService: jest.Mocked<EncryptionService>;

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn(),
      },
      profile: {
        update: jest.fn(),
      },
      loginHistory: {
        create: jest.fn(),
      },
    } as any;

    encryptionService = {
      encrypt: jest.fn(),
      decrypt: jest.fn(),
    } as any;

    authService = new AuthService(
      prisma,
      encryptionService,
      'test-secret',
      'test-refresh-secret',
      3600,
      604800
    );
  });

  describe('hashPassword', () => {
    it('should hash password', async () => {
      const hash = await authService.hashPassword('password123');
      expect(hash).toBeDefined();
      expect(hash).not.toBe('password123');
    });
  });

  describe('verifyPassword', () => {
    it('should verify correct password', async () => {
      const hash = await authService.hashPassword('password123');
      const isValid = await authService.verifyPassword('password123', hash);
      expect(isValid).toBe(true);
    });

    it('should reject incorrect password', async () => {
      const hash = await authService.hashPassword('password123');
      const isValid = await authService.verifyPassword('wrongpassword', hash);
      expect(isValid).toBe(false);
    });
  });

  describe('generateJWT', () => {
    it('should generate JWT token', () => {
      const payload = { userId: 1, email: 'test@example.com', roles: ['user'] };
      const token = authService.generateJWT(payload);
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
    });
  });

  describe('verifyJWT', () => {
    it('should verify valid JWT token', () => {
      const payload = { userId: 1, email: 'test@example.com', roles: ['user'] };
      const token = authService.generateJWT(payload);
      const verified = authService.verifyJWT(token);
      expect(verified.userId).toBe(payload.userId);
      expect(verified.email).toBe(payload.email);
    });

    it('should throw error for invalid token', () => {
      expect(() => authService.verifyJWT('invalid-token')).toThrow();
    });
  });
});

