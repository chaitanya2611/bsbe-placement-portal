import { SetMetadata } from '@nestjs/common';
import type { UserRole } from './identity.models';

export const IS_PUBLIC_KEY = 'identity:is-public';
export const PERMISSIONS_KEY = 'identity:permissions';
export const RECENT_AUTH_KEY = 'identity:recent-auth';

export type Permission =
  | 'audit:read'
  | 'analytics:read'
  | 'attempt:manage'
  | 'exam:manage'
  | 'export:manage'
  | 'media:manage'
  | 'program:manage'
  | 'question:manage'
  | 'question:rubric-read'
  | 'result:manage'
  | 'session:revoke'
  | 'user:create-admin'
  | 'user:manage';

const rolePermissions: Readonly<Record<UserRole, ReadonlySet<Permission>>> = {
  admin: new Set<Permission>([
    'audit:read',
    'analytics:read',
    'attempt:manage',
    'exam:manage',
    'export:manage',
    'media:manage',
    'program:manage',
    'question:manage',
    'question:rubric-read',
    'result:manage',
    'session:revoke',
    'user:create-admin',
    'user:manage',
  ]),
  student: new Set<Permission>(),
};

export const Public = (): ReturnType<typeof SetMetadata> => SetMetadata(IS_PUBLIC_KEY, true);
export const RequirePermissions = (...permissions: Permission[]): ReturnType<typeof SetMetadata> =>
  SetMetadata(PERMISSIONS_KEY, permissions);
export const RequireRecentAuthentication = (): ReturnType<typeof SetMetadata> =>
  SetMetadata(RECENT_AUTH_KEY, true);

export function roleHasPermissions(role: UserRole, permissions: readonly Permission[]): boolean {
  return permissions.every((permission) => rolePermissions[role].has(permission));
}
