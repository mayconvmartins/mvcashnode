"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const auth_service_1 = require("../auth.service");
describe('AuthService', () => {
    let authService;
    let prisma;
    let encryptionService;
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
        };
        encryptionService = {
            encrypt: jest.fn(),
            decrypt: jest.fn(),
        };
        authService = new auth_service_1.AuthService(prisma, encryptionService, 'test-secret', 'test-refresh-secret', 3600, 604800);
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
//# sourceMappingURL=auth.service.spec.js.map