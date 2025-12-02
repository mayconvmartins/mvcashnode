"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserService = void 0;
const shared_1 = require("@mvcashnode/shared");
class UserService {
    prisma;
    authService;
    constructor(prisma, authService) {
        this.prisma = prisma;
        this.authService = authService;
    }
    async createUser(dto) {
        const passwordHash = await this.authService.hashPassword(dto.password);
        const user = await this.prisma.user.create({
            data: {
                email: dto.email,
                password_hash: passwordHash,
                must_change_password: dto.mustChangePassword ?? true,
                profile: {
                    create: {
                        full_name: dto.fullName,
                        phone: dto.phone,
                        whatsapp_phone: dto.whatsappPhone,
                    },
                },
                roles: {
                    create: {
                        role: dto.role || shared_1.UserRole.USER,
                    },
                },
            },
        });
        return {
            id: user.id,
            email: user.email,
        };
    }
    async getUserById(userId) {
        return this.prisma.user.findUnique({
            where: { id: userId },
            include: {
                profile: true,
                roles: true,
            },
        });
    }
    async getUserByEmail(email) {
        return this.prisma.user.findUnique({
            where: { email },
            include: {
                profile: true,
                roles: true,
            },
        });
    }
    async updateUser(userId, dto) {
        const updateData = {};
        if (dto.email !== undefined)
            updateData.email = dto.email;
        if (dto.isActive !== undefined)
            updateData.is_active = dto.isActive;
        const profileUpdate = {};
        if (dto.fullName !== undefined)
            profileUpdate.full_name = dto.fullName;
        if (dto.phone !== undefined)
            profileUpdate.phone = dto.phone;
        if (dto.whatsappPhone !== undefined)
            profileUpdate.whatsapp_phone = dto.whatsappPhone;
        return this.prisma.user.update({
            where: { id: userId },
            data: {
                ...updateData,
                ...(Object.keys(profileUpdate).length > 0 && {
                    profile: {
                        update: profileUpdate,
                    },
                }),
            },
            include: {
                profile: true,
                roles: true,
            },
        });
    }
    async changePassword(userId, currentPassword, newPassword) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
        });
        if (!user) {
            throw new Error('User not found');
        }
        const isValid = await this.authService.verifyPassword(currentPassword, user.password_hash);
        if (!isValid) {
            throw new Error('Current password is incorrect');
        }
        const newPasswordHash = await this.authService.hashPassword(newPassword);
        await this.prisma.user.update({
            where: { id: userId },
            data: {
                password_hash: newPasswordHash,
                must_change_password: false,
            },
        });
    }
    async forcePasswordChange(userId) {
        await this.prisma.user.update({
            where: { id: userId },
            data: {
                must_change_password: true,
            },
        });
    }
    async activateUser(userId) {
        await this.prisma.user.update({
            where: { id: userId },
            data: {
                is_active: true,
            },
        });
    }
    async deactivateUser(userId) {
        await this.prisma.user.update({
            where: { id: userId },
            data: {
                is_active: false,
            },
        });
    }
    async getLoginHistory(userId, limit = 50) {
        return this.prisma.loginHistory.findMany({
            where: { user_id: userId },
            orderBy: { created_at: 'desc' },
            take: limit,
        });
    }
}
exports.UserService = UserService;
//# sourceMappingURL=user.service.js.map