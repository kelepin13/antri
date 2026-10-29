import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';

export type Role = 'CUSTOMER' | 'STAFF' | 'ADMIN';

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  venueId: string | null;
}

export const IS_PUBLIC = 'isPublic';
/** Skips the global JWT guard. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const ROLES = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user;
});
