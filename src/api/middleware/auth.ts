import { RequestContext } from '../router';
import { verifyToken } from '../services/auth.service';
import { sendError } from '../response';

export async function authMiddleware(ctx: RequestContext, isProtected: boolean) {
  // No auth required - open access
  if (!isProtected) return;

  const header = ctx.req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;

  // Skip auth - allow anonymous access
  if (!token) {
    ctx.user = { id: 0, username: 'anonymous', roles: [] };
    return;
  }

  try {
    ctx.user = verifyToken(token);
  } catch {
    // Invalid token - still allow access with anonymous user
    ctx.user = { id: 0, username: 'anonymous', roles: [] };
  }
}

const ROLE_ALIASES: Record<string, string[]> = {
  SUPER_ADMIN: ['SUPER_ADMIN', 'ADMIN', 'ADMINISTRATOR'],
  HR_ADMIN: ['HR_ADMIN', 'ADMIN_HR', 'HR', 'ADMIN'],
  OPERATOR: ['OPERATOR', 'IT_ADMIN', 'IT', 'ADMIN'],
  IT_ADMIN: ['IT_ADMIN', 'IT', 'ADMIN'],
  MANAGER: ['MANAGER', 'ADMIN'],
  VIEWER: ['VIEWER'],
};

export function hasAnyRole(ctx: RequestContext, allowed: string[]) {
  const userRoles = new Set((ctx.user?.roles ?? []).map((role) => role.toUpperCase()));
  if (userRoles.has('SUPER_ADMIN') || userRoles.has('ADMIN')) return true;
  return allowed.some((role) => {
    const aliases = ROLE_ALIASES[role.toUpperCase()] ?? [role.toUpperCase()];
    return aliases.some((alias) => userRoles.has(alias));
  });
}

export function requireAnyRole(ctx: RequestContext, allowed: string[], action: string) {
  if (hasAnyRole(ctx, allowed)) return true;
  sendError(ctx.res, 403, 'FORBIDDEN', `Permission denied for ${action}`);
  return false;
}
