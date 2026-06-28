import bcrypt from 'bcryptjs';
import { closeDbPool, execute, query, sql, withTransaction } from '../lib/db';

async function upsert(statement: string, params: Parameters<typeof execute>[1] = []) {
  await execute(statement, params);
}

async function seedRolesAndUsers() {
  const roles = ['ADMIN', 'HR', 'MANAGER', 'SYNC_OPERATOR', 'VIEWER'];
  for (const role of roles) {
    await upsert(`IF NOT EXISTS (SELECT 1 FROM roles WHERE code=@code) INSERT INTO roles(code,name,description) VALUES(@code,@name,@description)`, [
      { name: 'code', type: sql.NVarChar, value: role },
      { name: 'name', type: sql.NVarChar, value: role.replace('_', ' ') },
      { name: 'description', type: sql.NVarChar, value: `Dummy ${role} role` },
    ]);
  }

  const passwordHash = await bcrypt.hash('Password123!', 10);
  for (let index = 1; index <= 5; index++) {
    const username = `dummy_user_${index}`;
    await upsert(`IF NOT EXISTS (SELECT 1 FROM users WHERE username=@username)
      INSERT INTO users(username,display_name,email,password_hash) VALUES(@username,@displayName,@email,@passwordHash)`, [
      { name: 'username', type: sql.NVarChar, value: username },
      { name: 'displayName', type: sql.NVarChar, value: `Dummy User ${index}` },
      { name: 'email', type: sql.NVarChar, value: `dummy.user.${index}@example.local` },
      { name: 'passwordHash', type: sql.NVarChar, value: passwordHash },
    ]);
    await upsert(`IF NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id=(SELECT id FROM users WHERE username=@username) AND role_id=(SELECT id FROM roles WHERE code=@role))
      INSERT INTO user_roles(user_id, role_id) SELECT u.id, r.id FROM users u CROSS JOIN roles r WHERE u.username=@username AND r.code=@role`, [
      { name: 'username', type: sql.NVarChar, value: username },
      { name: 'role', type: sql.NVarChar, value: roles[index - 1] },
    ]);
  }
}

async function seedOrganization() {
  const divisions = ['DIV-A', 'DIV-B', 'DIV-C', 'DIV-D', 'DIV-E'];
  for (const code of divisions) {
    await upsert(`IF NOT EXISTS (SELECT 1 FROM divisions WHERE division_code=@code) INSERT INTO divisions(division_code,division_name) VALUES(@code,@name)`, [
      { name: 'code', type: sql.NVarChar, value: code }, { name: 'name', type: sql.NVarChar, value: `Dummy ${code}` },
    ]);
  }
  // gangs table dropped (Phase B) — skip gang seeding
  for (let index = 1; index <= 50; index++) {
    const divisionCode = divisions[(index - 1) % divisions.length];
    const employeeCode = `EMP${index.toString().padStart(3, '0')}`;
    await upsert(`IF NOT EXISTS (SELECT 1 FROM employees WHERE employee_code=@employeeCode)
      INSERT INTO employees(employee_code,employee_name,division_id)
      SELECT @employeeCode,@employeeName,d.id FROM divisions d WHERE d.division_code=@divisionCode`, [
      { name: 'employeeCode', type: sql.NVarChar, value: employeeCode }, { name: 'employeeName', type: sql.NVarChar, value: `Dummy Employee ${index}` }, { name: 'divisionCode', type: sql.NVarChar, value: divisionCode },
    ]);
  }
}

async function seedMachineKnowledge() {
  const scanners: Array<[string, number]> = [['P1A',100],['ARC',200],['P1B',300],['AB2',400],['P2A',500],['P2B',600],['DME',700],['ARA',800],['AB1',900]];
  for (const [division, code] of scanners) await upsert(`IF NOT EXISTS (SELECT 1 FROM scanner_configs WHERE type='scanner' AND scanner_code=@scannerCode) INSERT INTO scanner_configs(type,division_code,scanner_code,description) VALUES('scanner',@divisionCode,@scannerCode,@description)`, [{ name: 'divisionCode', type: sql.NVarChar, value: division }, { name: 'scannerCode', type: sql.Int, value: code }, { name: 'description', type: sql.NVarChar, value: `${division} scanner code` }]);
  const locs: Array<[string, string]> = [['P1A','A'],['P1B','B'],['P2A','C'],['P2B','D'],['DME','E'],['ARA','F'],['AB1','G'],['AB2','H'],['ARC','J'],['IJL','L'],['PGE','A']];
  for (const [division, loc] of locs) await upsert(`IF NOT EXISTS (SELECT 1 FROM scanner_configs WHERE type='loc' AND division_code=@divisionCode AND loc_code=@locCode) INSERT INTO scanner_configs(type,division_code,loc_code,emp_code_prefix,description) VALUES('loc',@divisionCode,@locCode,@locCode,@description)`, [{ name: 'divisionCode', type: sql.NVarChar, value: division }, { name: 'locCode', type: sql.NVarChar, value: loc }, { name: 'description', type: sql.NVarChar, value: `${division} loc code` }]);

  const machines = [
    ['DEVICE-001','Dummy Device 001','192.0.2.10',4370,'ACCESSIBLE','DIRECT_ZKTECO'],
    ['DEVICE-002','Dummy Device 002','192.0.2.11',4370,'ACCESSIBLE','DIRECT_ZKTECO'],
    ['DEVICE-003','Dummy API Device','192.0.2.12',4100,'PORT_BLOCKED','PORT_BLOCKED'],
    ['DEVICE-004','Dummy Forwarding Needed','192.0.2.13',4200,'PORT_FORWARDING_NEEDED','DIRECT_ZKTECO'],
    ['DEVICE-005','Dummy Unreachable','192.0.2.14',4370,'NETWORK_UNREACHABLE','DIRECT_ZKTECO'],
  ];
  for (const machine of machines) await upsert(`IF NOT EXISTS (SELECT 1 FROM attendance_machines WHERE machine_code=@machineCode)
    INSERT INTO attendance_machines(machine_code,location_name,ip_address,port,machine_type,scanner_code,loc_code,access_status,data_source,notes)
    VALUES(@machineCode,@locationName,@ipAddress,@port,'ZKTECO',100,'A',@accessStatus,@dataSource,'Dummy machine; safe placeholder')`, [
    { name: 'machineCode', type: sql.NVarChar, value: machine[0] }, { name: 'locationName', type: sql.NVarChar, value: machine[1] }, { name: 'ipAddress', type: sql.NVarChar, value: machine[2] }, { name: 'port', type: sql.Int, value: machine[3] }, { name: 'accessStatus', type: sql.NVarChar, value: machine[4] }, { name: 'dataSource', type: sql.NVarChar, value: machine[5] },
  ]);
}

async function seedAttendance() {
  await upsert(`IF NOT EXISTS (SELECT 1 FROM attendance_import_batches WHERE batch_code='DUMMY-2026-05') INSERT INTO attendance_import_batches(batch_code,source,period_start,period_end,status,finished_at,records_total,records_success) VALUES('DUMMY-2026-05','DUMMY','2026-05-01','2026-05-31','SUCCESS',SYSUTCDATETIME(),1550,1550)`);
  for (let employee = 1; employee <= 50; employee++) {
    for (let day = 1; day <= 31; day++) {
      const code = `EMP${employee.toString().padStart(3, '0')}`;
      const date = `2026-05-${day.toString().padStart(2, '0')}`;
      const status = day % 7 === 0 ? 'ABSENT' : 'PRESENT';
      await upsert(`IF NOT EXISTS (SELECT 1 FROM attendance_imports WHERE employee_code=@employeeCode AND attendance_date=@attendanceDate AND source='DUMMY' AND source_reference=@sourceReference)
        INSERT INTO attendance_imports(employee_id,employee_code,division_code,attendance_date,attendance_year,attendance_month,check_in_at,check_out_at,attendance_status,has_work,overtime_hours,source,source_reference,batch_id)
        SELECT e.id,e.employee_code,d.division_code,@attendanceDate,2026,5,DATEADD(HOUR,7,CAST(@attendanceDate AS DATETIME2)),DATEADD(HOUR,16,CAST(@attendanceDate AS DATETIME2)),@status,CASE WHEN @status='PRESENT' THEN 1 ELSE 0 END,CASE WHEN @status='PRESENT' AND @day % 5 = 0 THEN 1.5 ELSE 0 END,'DUMMY',@sourceReference,(SELECT id FROM attendance_import_batches WHERE batch_code='DUMMY-2026-05')
        FROM employees e JOIN divisions d ON d.id=e.division_id WHERE e.employee_code=@employeeCode`, [
        { name: 'employeeCode', type: sql.NVarChar, value: code }, { name: 'attendanceDate', type: sql.Date, value: date }, { name: 'status', type: sql.NVarChar, value: status }, { name: 'day', type: sql.Int, value: day }, { name: 'sourceReference', type: sql.NVarChar, value: `DUMMY-${code}-${date}` },
      ]);
    }
  }
  // attendance_manual_corrections + attendance_sync_logs dropped (Phase B) — skip seeding
}

async function seedConfigs() {
  const configs = [['sync.interval_minutes','15','Default sync interval'],['attendance.final_rule','manual_correction > imported_attendance > no_data','Final attendance priority'],['zkteco.password','', 'Sensitive machine password placeholder']];
  for (const config of configs) await upsert(`IF NOT EXISTS (SELECT 1 FROM app_configs WHERE config_key=@key) INSERT INTO app_configs(config_key,config_value,is_sensitive,description) VALUES(@key,@value,@sensitive,@description)`, [{ name: 'key', type: sql.NVarChar, value: config[0] }, { name: 'value', type: sql.NVarChar, value: config[1] }, { name: 'sensitive', type: sql.Bit, value: config[0].includes('password') }, { name: 'description', type: sql.NVarChar, value: config[2] }]);
}

async function main() {
  await withTransaction(async () => undefined);
  await seedRolesAndUsers();
  await seedOrganization();
  await seedMachineKnowledge();
  await seedAttendance();
  await seedConfigs();
  const count = await query<{ total: number }>('SELECT COUNT(*) AS total FROM employees');
  console.log(`Dummy seed complete. Employees: ${count[0]?.total ?? 0}. Login: dummy_user_1 / Password123!`);
  await closeDbPool();
}

main().catch(async (error) => { console.error('Dummy seed failed', { message: error.message }); await closeDbPool(); process.exit(1); });
