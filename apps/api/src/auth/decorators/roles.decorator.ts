import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@mvcashnode/shared';

export const Roles = (...roles: UserRole[]) => SetMetadata('roles', roles);

