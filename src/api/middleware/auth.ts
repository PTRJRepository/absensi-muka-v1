import { RequestContext } from '../router';
import { verifyToken } from '../services/auth.service';
import { sendError } from '../response';
import { env } from '../../config/env';
import { createHash } from 'crypto';

/** Constant-time compare via SHA-256 to avoid timing-attack on the API key. */
function safeEqual(a: string, b: string): boolean {
  const bufA = createHash('sha256').update(a).digest();
  const bufB = createHash('sha256').update(b).digest();
  return bufA.equals(bufB);
}

export async function authMiddleware(ctx: RequestContext, isProtected: boolean) {
  // No auth required - open access
  if (!isProtected) return;

  // Static API key (never expires) — for external data-pull integrations.
  // Header: X-API-Key: <key>. Grants SUPER_ADMIN access to all attendance data.
  const apiKey = ctx.req.headers['x-api-key'];
  if (env.ATTENDANCE_API_KEY && typeof apiKey === 'string' && apiKey.length > 0) {
    if (safeEqual(apiKey, env.ATTENDANCE_API_KEY)) {
      ctx.user = { id: 0, username: 'api-key', roles: ['SUPER_ADMIN'] };
      return;
    }
  }

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
