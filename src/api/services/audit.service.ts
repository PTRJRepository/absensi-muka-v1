import { execute, sql } from '../../lib/db';

export async function writeAudit(input: {
  entityType: string;
  entityId?: string | number | null;
  employeeCode?: string | null;
  divisionCode?: string | null;
  fieldName?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  actionType: string;
  reason?: string | null;
  changedBy?: number | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  await execute(`
    INSERT INTO attendance_change_logs
      (entity_type, entity_id, employee_code, division_code, field_name, old_value, new_value, action_type, reason, changed_by, ip_address, user_agent)
    VALUES
      (@entityType, @entityId, @employeeCode, @divisionCode, @fieldName, @oldValue, @newValue, @actionType, @reason, @changedBy, @ipAddress, @userAgent)
  `, [
    { name: 'entityType', type: sql.NVarChar, value: input.entityType },
    { name: 'entityId', type: sql.NVarChar, value: input.entityId == null ? null : String(input.entityId) },
    { name: 'employeeCode', type: sql.NVarChar, value: input.employeeCode ?? null },
    { name: 'divisionCode', type: sql.NVarChar, value: input.divisionCode ?? null },
    { name: 'fieldName', type: sql.NVarChar, value: input.fieldName ?? null },
    { name: 'oldValue', type: sql.NVarChar, value: input.oldValue ?? null },
    { name: 'newValue', type: sql.NVarChar, value: input.newValue ?? null },
    { name: 'actionType', type: sql.NVarChar, value: input.actionType },
    { name: 'reason', type: sql.NVarChar, value: input.reason ?? null },
    { name: 'changedBy', type: sql.Int, value: input.changedBy ?? null },
    { name: 'ipAddress', type: sql.NVarChar, value: input.ipAddress ?? null },
    { name: 'userAgent', type: sql.NVarChar, value: input.userAgent ?? null },
  ]);
}
