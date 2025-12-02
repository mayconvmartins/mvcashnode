"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const bcrypt = __importStar(require("bcrypt"));
const jwt = __importStar(require("jsonwebtoken"));
const otplib_1 = require("otplib");
class AuthService {
    prisma;
    encryptionService;
    jwtSecret;
    jwtRefreshSecret;
    jwtExpiresIn;
    jwtRefreshExpiresIn;
    constructor(prisma, encryptionService, jwtSecret, jwtRefreshSecret, jwtExpiresIn = 3600, jwtRefreshExpiresIn = 604800) {
        this.prisma = prisma;
        this.encryptionService = encryptionService;
        this.jwtSecret = jwtSecret;
        this.jwtRefreshSecret = jwtRefreshSecret;
        this.jwtExpiresIn = jwtExpiresIn;
        this.jwtRefreshExpiresIn = jwtRefreshExpiresIn;
    }
    async hashPassword(password) {
        const saltRounds = 12;
        return bcrypt.hash(password, saltRounds);
    }
    async verifyPassword(password, hash) {
        return bcrypt.compare(password, hash);
    }
    generateJWT(payload) {
        return jwt.sign(payload, this.jwtSecret, {
            expiresIn: this.jwtExpiresIn,
        });
    }
    verifyJWT(token) {
        try {
            return jwt.verify(token, this.jwtSecret);
        }
        catch (error) {
            throw new Error('Invalid or expired token');
        }
    }
    generateRefreshToken(payload) {
        return jwt.sign(payload, this.jwtRefreshSecret, {
            expiresIn: this.jwtRefreshExpiresIn,
        });
    }
    verifyRefreshToken(token) {
        try {
            return jwt.verify(token, this.jwtRefreshSecret);
        }
        catch (error) {
            throw new Error('Invalid or expired refresh token');
        }
    }
    async setup2FA(userId) {
        const secret = otplib_1.authenticator.generateSecret();
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            include: { profile: true },
        });
        if (!user || !user.profile) {
            throw new Error('User not found');
        }
        const encryptedSecret = await this.encryptionService.encrypt(secret);
        await this.prisma.profile.update({
            where: { user_id: userId },
            data: {
                twofa_secret: encryptedSecret,
                twofa_enabled: false,
            },
        });
        const serviceName = 'Trading Automation';
        const accountName = user.email;
        const otpauth = otplib_1.authenticator.keyuri(accountName, serviceName, secret);
        return {
            secret,
            qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(otpauth)}`,
        };
    }
    async verify2FA(userId, token) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            include: { profile: true },
        });
        if (!user?.profile?.twofa_secret) {
            throw new Error('2FA not set up');
        }
        const decryptedSecret = await this.encryptionService.decrypt(user.profile.twofa_secret);
        const isValid = otplib_1.authenticator.verify({ token, secret: decryptedSecret });
        if (isValid && !user.profile.twofa_enabled) {
            await this.prisma.profile.update({
                where: { user_id: userId },
                data: { twofa_enabled: true },
            });
        }
        return isValid;
    }
    async login(credentials, ip, userAgent) {
        const user = await this.prisma.user.findUnique({
            where: { email: credentials.email },
            include: {
                profile: true,
                roles: true,
            },
        });
        if (!user || !user.is_active) {
            await this.logLoginAttempt(credentials.email, false, ip, userAgent);
            throw new Error('Invalid credentials');
        }
        const isValidPassword = await this.verifyPassword(credentials.password, user.password_hash);
        if (!isValidPassword) {
            await this.logLoginAttempt(user.id, false, ip, userAgent);
            throw new Error('Invalid credentials');
        }
        if (user.profile?.twofa_enabled) {
            if (!credentials.twoFactorCode) {
                const sessionToken = this.generateJWT({
                    userId: user.id,
                    email: user.email,
                    roles: user.roles.map((r) => r.role),
                });
                return {
                    requires2FA: true,
                    sessionToken,
                };
            }
            const isValid2FA = await this.verify2FA(user.id, credentials.twoFactorCode);
            if (!isValid2FA) {
                await this.logLoginAttempt(user.id, false, ip, userAgent);
                throw new Error('Invalid 2FA code');
            }
        }
        if (user.must_change_password) {
            await this.logLoginAttempt(user.id, false, ip, userAgent);
            throw new Error('Password change required');
        }
        await this.logLoginAttempt(user.id, true, ip, userAgent);
        const roles = user.roles.map((r) => r.role);
        const payload = {
            userId: user.id,
            email: user.email,
            roles,
        };
        const accessToken = this.generateJWT(payload);
        const refreshToken = this.generateRefreshToken(payload);
        return {
            requires2FA: false,
            accessToken,
            refreshToken,
            expiresIn: this.jwtExpiresIn,
            user: {
                id: user.id,
                email: user.email,
                fullName: user.profile?.full_name || undefined,
                roles,
            },
        };
    }
    async refreshToken(refreshToken) {
        const payload = this.verifyRefreshToken(refreshToken);
        const user = await this.prisma.user.findUnique({
            where: { id: payload.userId },
            include: { roles: true },
        });
        if (!user || !user.is_active) {
            throw new Error('User not found or inactive');
        }
        const newPayload = {
            userId: user.id,
            email: user.email,
            roles: user.roles.map((r) => r.role),
        };
        return {
            accessToken: this.generateJWT(newPayload),
            refreshToken: this.generateRefreshToken(newPayload),
        };
    }
    async logLoginAttempt(userIdOrEmail, success, ip, userAgent) {
        if (typeof userIdOrEmail === 'string') {
            return;
        }
        await this.prisma.loginHistory.create({
            data: {
                user_id: userIdOrEmail,
                ip: ip || null,
                user_agent: userAgent || null,
                success,
            },
        });
    }
}
exports.AuthService = AuthService;
//# sourceMappingURL=auth.service.js.map