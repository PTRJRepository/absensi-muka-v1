import { query } from '../../lib/db';
import { route } from '../router';
import { sendJson } from '../response';

route('GET', '/api/audit/logs', async (ctx) => sendJson(ctx.res, 200, await query('SELECT TOP 200 * FROM attendance_change_logs ORDER BY changed_at DESC')));
