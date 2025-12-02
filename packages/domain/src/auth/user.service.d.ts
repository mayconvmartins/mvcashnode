import { PrismaClient } from '@mvcashnode/db';
import { AuthService } from './auth.service';
export interface CreateUserDto {
    email: string;
    password: string;
    fullName?: string;
    phone?: string;
    whatsappPhone?: string;
    role?: string;
    mustChangePassword?: boolean;
}
export interface UpdateUserDto {
    email?: string;
    fullName?: string;
    phone?: string;
    whatsappPhone?: string;
    isActive?: boolean;
}
export declare class UserService {
    private prisma;
    private authService;
    constructor(prisma: PrismaClient, authService: AuthService);
    createUser(dto: CreateUserDto): Promise<{
        id: number;
        email: string;
    }>;
    getUserById(userId: number): Promise<{
        profile: {
            id: number;
            created_at: Date;
            updated_at: Date;
            user_id: number;
            full_name: string | null;
            phone: string | null;
            whatsapp_phone: string | null;
            position_alerts_enabled: boolean;
            twofa_enabled: boolean;
            twofa_secret: string | null;
        };
        roles: {
            id: number;
            user_id: number;
            role: string;
        }[];
    } & {
        id: number;
        email: string;
        password_hash: string;
        is_active: boolean;
        must_change_password: boolean;
        created_at: Date;
        updated_at: Date;
    }>;
    getUserByEmail(email: string): Promise<{
        profile: {
            id: number;
            created_at: Date;
            updated_at: Date;
            user_id: number;
            full_name: string | null;
            phone: string | null;
            whatsapp_phone: string | null;
            position_alerts_enabled: boolean;
            twofa_enabled: boolean;
            twofa_secret: string | null;
        };
        roles: {
            id: number;
            user_id: number;
            role: string;
        }[];
    } & {
        id: number;
        email: string;
        password_hash: string;
        is_active: boolean;
        must_change_password: boolean;
        created_at: Date;
        updated_at: Date;
    }>;
    updateUser(userId: number, dto: UpdateUserDto): Promise<{
        profile: {
            id: number;
            created_at: Date;
            updated_at: Date;
            user_id: number;
            full_name: string | null;
            phone: string | null;
            whatsapp_phone: string | null;
            position_alerts_enabled: boolean;
            twofa_enabled: boolean;
            twofa_secret: string | null;
        };
        roles: {
            id: number;
            user_id: number;
            role: string;
        }[];
    } & {
        id: number;
        email: string;
        password_hash: string;
        is_active: boolean;
        must_change_password: boolean;
        created_at: Date;
        updated_at: Date;
    }>;
    changePassword(userId: number, currentPassword: string, newPassword: string): Promise<void>;
    forcePasswordChange(userId: number): Promise<void>;
    activateUser(userId: number): Promise<void>;
    deactivateUser(userId: number): Promise<void>;
    getLoginHistory(userId: number, limit?: number): Promise<{
        ip: string | null;
        id: number;
        created_at: Date;
        user_id: number;
        user_agent: string | null;
        success: boolean;
    }[]>;
}
//# sourceMappingURL=user.service.d.ts.map