import { PrismaClient } from '@mvcashnode/db';
import { EncryptionService } from '@mvcashnode/shared';
export interface LoginCredentials {
    email: string;
    password: string;
    twoFactorCode?: string;
}
export interface LoginResult {
    requires2FA: boolean;
    sessionToken?: string;
    accessToken?: string;
    refreshToken?: string;
    expiresIn?: number;
    user?: {
        id: number;
        email: string;
        fullName?: string;
        roles: string[];
    };
}
export interface JwtPayload {
    userId: number;
    email: string;
    roles: string[];
}
export declare class AuthService {
    private prisma;
    private encryptionService;
    private jwtSecret;
    private jwtRefreshSecret;
    private jwtExpiresIn;
    private jwtRefreshExpiresIn;
    constructor(prisma: PrismaClient, encryptionService: EncryptionService, jwtSecret: string, jwtRefreshSecret: string, jwtExpiresIn?: number, jwtRefreshExpiresIn?: number);
    hashPassword(password: string): Promise<string>;
    verifyPassword(password: string, hash: string): Promise<boolean>;
    generateJWT(payload: JwtPayload): string;
    verifyJWT(token: string): JwtPayload;
    generateRefreshToken(payload: JwtPayload): string;
    verifyRefreshToken(token: string): JwtPayload;
    setup2FA(userId: number): Promise<{
        secret: string;
        qrCodeUrl: string;
    }>;
    verify2FA(userId: number, token: string): Promise<boolean>;
    login(credentials: LoginCredentials, ip?: string, userAgent?: string): Promise<LoginResult>;
    refreshToken(refreshToken: string): Promise<{
        accessToken: string;
        refreshToken: string;
    }>;
    private logLoginAttempt;
}
//# sourceMappingURL=auth.service.d.ts.map