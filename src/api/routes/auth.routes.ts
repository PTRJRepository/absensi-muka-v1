import { z } from 'zod';
import { route, validate } from '../router';
import { sendJson, sendError } from '../response';
import { login, loginSchema } from '../services/auth.service';
import { writeAudit } from '../services/audit.service';

route('POST', '/api/auth/login', async (ctx) => {
  const input = validate(loginSchema, ctx.body);
  const result = await login(input);
  if (!result) return sendError(ctx.res, 401, 'INVALID_CREDENTIALS', 'Invalid username or password');
  await writeAudit({ entityType: 'USER', entityId: result.user.id, actionType: 'LOGIN', changedBy: result.user.id, ipAddress: ctx.req.socket.remoteAddress ?? null, userAgent: ctx.req.headers['user-agent'] ?? null });
  sendJson(ctx.res, 200, result);
}, { protected: false });

route('POST', '/api/auth/logout', async (ctx) => sendJson(ctx.res, 200, { loggedOut: true }));
route('GET', '/api/auth/me', async (ctx) => sendJson(ctx.res, 200, ctx.user));
