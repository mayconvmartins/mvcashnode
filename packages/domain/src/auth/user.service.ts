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
    console.log('[USER-DEBUG] createUser iniciado para:', dto.email);
    const passwordHash = await this.authService.hashPassword(dto.password);

    console.log('[USER-DEBUG] createUser - hash gerado:', {
      hashLength: passwordHash.length,
      hashPrefix: passwordHash.substring(0, 20) + '...',
      hashFull: passwordHash
    });

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

    // Validar se foi salvo corretamente
    const savedUser = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { password_hash: true },
    });

    console.log('[USER-DEBUG] createUser - hash após salvar:', {
      userId: user.id,
      hashLength: savedUser?.password_hash.length,
      hashPrefix: savedUser?.password_hash.substring(0, 20) + '...',
      hashFull: savedUser?.password_hash,
      hashMatches: savedUser?.password_hash === passwordHash
    });

    // Verificar se o hash salvo funciona
    const testVerify = await this.authService.verifyPassword(dto.password, savedUser!.password_hash);
    console.log('[USER-DEBUG] createUser - teste de verificação após salvar:', testVerify);

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
    // Tratar campos vazios como null para limpar valores
    if (dto.fullName !== undefined) {
      profileUpdate.full_name = dto.fullName && dto.fullName.trim() !== '' ? dto.fullName.trim() : null;
    }
    if (dto.phone !== undefined) {
      profileUpdate.phone = dto.phone && dto.phone.trim() !== '' ? dto.phone.trim() : null;
    }
    if (dto.whatsappPhone !== undefined) {
      profileUpdate.whatsapp_phone = dto.whatsappPhone && dto.whatsappPhone.trim() !== '' ? dto.whatsappPhone.trim() : null;
    }

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
    console.log('[USER-DEBUG] changePassword iniciado para userId:', userId);
    
    if (!userId || !currentPassword || !newPassword) {
      const missing = [];
      if (!userId) missing.push('userId');
      if (!currentPassword) missing.push('currentPassword');
      if (!newPassword) missing.push('newPassword');
      throw new Error(`Missing required fields: ${missing.join(', ')}`);
    }

    if (newPassword.length < 8) {
      throw new Error('New password must be at least 8 characters long');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      console.log('[USER-DEBUG] changePassword - usuário não encontrado');
      throw new Error('User not found');
    }

    console.log('[USER-DEBUG] changePassword - hash atual no banco:', {
      hashLength: user.password_hash.length,
      hashPrefix: user.password_hash.substring(0, 20) + '...',
      hashFull: user.password_hash
    });

    const isValid = await this.authService.verifyPassword(currentPassword, user.password_hash);
    if (!isValid) {
      throw new Error('Current password is incorrect');
    }

    const newPasswordHash = await this.authService.hashPassword(newPassword);

    console.log('[USER-DEBUG] changePassword - salvando novo hash:', {
      hashLength: newPasswordHash.length,
      hashPrefix: newPasswordHash.substring(0, 20) + '...',
      hashFull: newPasswordHash
    });

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        password_hash: newPasswordHash,
        must_change_password: false,
      },
    });

    // Validar se foi salvo corretamente
    const updatedUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { password_hash: true },
    });

    console.log('[USER-DEBUG] changePassword - hash após salvar:', {
      hashLength: updatedUser?.password_hash.length,
      hashPrefix: updatedUser?.password_hash.substring(0, 20) + '...',
      hashFull: updatedUser?.password_hash,
      hashMatches: updatedUser?.password_hash === newPasswordHash
    });

    // Verificar se o hash salvo funciona
    const testVerify = await this.authService.verifyPassword(newPassword, updatedUser!.password_hash);
    console.log('[USER-DEBUG] changePassword - teste de verificação após salvar:', testVerify);
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
    console.log('[USER-DEBUG] adminChangePassword iniciado para userId:', userId);
    
    if (!userId || !newPassword) {
      const missing = [];
      if (!userId) missing.push('userId');
      if (!newPassword) missing.push('newPassword');
      throw new Error(`Missing required fields: ${missing.join(', ')}`);
    }

    if (newPassword.length < 8) {
      throw new Error('New password must be at least 8 characters long');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      console.log('[USER-DEBUG] adminChangePassword - usuário não encontrado');
      throw new Error('User not found');
    }

    console.log('[USER-DEBUG] adminChangePassword - hash atual no banco:', {
      hashLength: user.password_hash.length,
      hashPrefix: user.password_hash.substring(0, 20) + '...',
      hashFull: user.password_hash
    });

    const newPasswordHash = await this.authService.hashPassword(newPassword);

    console.log('[USER-DEBUG] adminChangePassword - salvando novo hash:', {
      hashLength: newPasswordHash.length,
      hashPrefix: newPasswordHash.substring(0, 20) + '...',
      hashFull: newPasswordHash
    });

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        password_hash: newPasswordHash,
        must_change_password: mustChangePassword,
      },
    });

    // Validar se foi salvo corretamente
    const updatedUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { password_hash: true },
    });

    console.log('[USER-DEBUG] adminChangePassword - hash após salvar:', {
      hashLength: updatedUser?.password_hash.length,
      hashPrefix: updatedUser?.password_hash.substring(0, 20) + '...',
      hashFull: updatedUser?.password_hash,
      hashMatches: updatedUser?.password_hash === newPasswordHash
    });

    // Verificar se o hash salvo funciona
    const testVerify = await this.authService.verifyPassword(newPassword, updatedUser!.password_hash);
    console.log('[USER-DEBUG] adminChangePassword - teste de verificação após salvar:', testVerify);
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

