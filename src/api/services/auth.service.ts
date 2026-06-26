import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import { z } from 'zod';
import { env } from '../../config/env';
import { query, sql } from '../../lib/db';

export const loginSchema = z.object({ username: z.string().min(1), password: z.string().min(1) });

export async function login(input: z.infer<typeof loginSchema>) {
  const rows = await query<{ id: number; username: string; password_hash: string; is_active: boolean }>(`
    SELECT id, username, password_hash, is_active
    FROM users
    WHERE username = @username
  `, [{ name: 'username', type: sql.NVarChar, value: input.username }]);

  const user = rows[0];
  if (!user?.is_active) return null;
  const valid = await bcrypt.compare(input.password, user.password_hash);
  if (!valid) return null;

  const roles = await query<{ code: string }>(`
    SELECT r.code
    FROM roles r
    INNER JOIN user_roles ur ON ur.role_id = r.id
    WHERE ur.user_id = @userId
  `, [{ name: 'userId', type: sql.Int, value: user.id }]);

  const payload = { id: user.id, username: user.username, roles: roles.map((role) => role.code) };
  const token = jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN } as SignOptions);
  return { token, user: payload };
}

export function verifyToken(token: string) {
  return jwt.verify(token, env.JWT_SECRET) as { id: number; username: string; roles: string[] };
}
