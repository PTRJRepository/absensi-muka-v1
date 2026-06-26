import { z } from 'zod';
import { query, sql } from '../../lib/db';
import { mapEmployeeCode } from '../../modules/mapping/employee-code-mapper';
import { route, validate } from '../router';
import { sendJson } from '../response';

route('GET', '/api/mapping/review', async (ctx) => {
  const rows = await query(
    "SELECT TOP 200 * FROM attendance_scan_logs WHERE mapping_status IN ('NEED_REVIEW','UNMAPPED','AMBIGUOUS') ORDER BY scan_date DESC, id DESC"
  );
  sendJson(ctx.res, 200, rows);
});

route('POST', '/api/mapping/preview', async (ctx) => {
  const input = validate(
    z.object({
      rawDeviceUserId: z.string().optional(),
      scannerCode: z.number().optional(),
      locCode: z.string().optional(),
      divisionCode: z.string().optional(),
      machineCode: z.string().optional(),
    }),
    ctx.body
  );
  sendJson(ctx.res, 200, mapEmployeeCode({ rawDeviceUserId: input.rawDeviceUserId ?? '' }));
});
