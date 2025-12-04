import { PrismaClient } from '@mvcashnode/db';
import { AuthService } from './auth.service';
import { UserRole } from '@mvcashnode/shared';

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

export class UserService {
  constructor(
    private prisma: PrismaClient,
    private authService: AuthService
  ) {}

  async createUser(dto: CreateUserDto): Promise<{ id: number; email: string }> {
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
            role: (dto.role as UserRole) || UserRole.USER,
          },
        },
      },
    });

    return {
      id: user.id,
      email: user.email,
    };
  }

  async getUserById(userId: number) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        roles: true,
      },
    });
  }

  async getUserByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      include: {
        profile: true,
        roles: true,
      },
    });
  }

  async updateUser(userId: number, dto: UpdateUserDto) {
    const updateData: any = {};

    if (dto.email !== undefined) updateData.email = dto.email;
    if (dto.isActive !== undefined) updateData.is_active = dto.isActive;

    const profileUpdate: any = {};
    if (dto.fullName !== undefined) profileUpdate.full_name = dto.fullName;
    if (dto.phone !== undefined) profileUpdate.phone = dto.phone;
    if (dto.whatsappPhone !== undefined) profileUpdate.whatsapp_phone = dto.whatsappPhone;

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

  async changePassword(userId: number, currentPassword: string, newPassword: string): Promise<void> {
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

  async forcePasswordChange(userId: number): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        must_change_password: true,
      },
    });
  }

  async adminChangePassword(
    userId: number,
    newPassword: string,
    mustChangePassword: boolean = false
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error('User not found');
    }

    const newPasswordHash = await this.authService.hashPassword(newPassword);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        password_hash: newPasswordHash,
        must_change_password: mustChangePassword,
      },
    });
  }

  async activateUser(userId: number): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        is_active: true,
      },
    });
  }

  async deactivateUser(userId: number): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        is_active: false,
      },
    });
  }

  async getLoginHistory(userId: number, limit: number = 50) {
    return this.prisma.loginHistory.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
      take: limit,
    });
  }
}

