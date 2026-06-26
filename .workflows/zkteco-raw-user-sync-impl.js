export const meta = {
  name: 'zkteco-raw-user-sync-impl',
  description: 'Implement ZKTeco Raw User Sync First: getUsers() stored first, then join to attendance',
  phases: [
    { title: 'Migration', detail: 'Create migration 059 for metadata columns' },
    { title: 'Sync Logic', detail: 'Update sync-orchestrator.service.ts - getUsers() first, MERGE, UPDATE JOIN' },
    { title: 'Backfill', detail: 'Create backfill SQL migration' },
    { title: 'API Update', detail: 'Update machine-employee.routes.ts for zkteco_user_name_source' },
    { title: 'Frontend', detail: 'Update attendance-service.ts display name priority' }
  ],
};

const fs = require('fs');

// ── PHASE 1: Migration ───────────────────────────────────────────────────────
phase('Migration');

const migration059 = `-- Migration: 059_add_zkteco_user_name_metadata.sql
-- Date: 2026-06-25
-- Purpose: Add metadata columns to attendance_scan_logs for user name sync tracking
-- Source: docs/ZKTECO-RAW-USER-SYNC-FIRST.md

PRINT '=== Running migration 059: Add zkteco_user_name metadata columns ===';

-- Step 1: Add zkteco_user_name_source
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'dbo'
      AND TABLE_NAME = 'attendance_scan_logs'
      AND COLUMN_NAME = 'zkteco_user_name_source'
)
BEGIN
    ALTER TABLE dbo.attendance_scan_logs
    ADD zkteco_user_name_source NVARCHAR(30) NULL;
    PRINT '  [OK] Added zkteco_user_name_source NVARCHAR(30) NULL';
END
ELSE
BEGIN
    PRINT '  [SKIP] zkteco_user_name_source already exists';
END

-- Step 2: Add zkteco_user_name_synced_at
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'dbo'
      AND TABLE_NAME = 'attendance_scan_logs'
      AND COLUMN_NAME = 'zkteco_user_name_synced_at'
)
BEGIN
    ALTER TABLE dbo.attendance_scan_logs
    ADD zkteco_user_name_synced_at DATETIME2 NULL;
    PRINT '  [OK] Added zkteco_user_name_synced_at DATETIME2 NULL';
END
ELSE
BEGIN
    PRINT '  [SKIP] zkteco_user_name_synced_at already exists';
END

-- Step 3: Add zkteco_user_name_sync_status
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'dbo'
      AND TABLE_NAME = 'attendance_scan_logs'
      AND COLUMN_NAME = 'zkteco_user_name_sync_status'
)
BEGIN
    ALTER TABLE dbo.attendance_scan_logs
    ADD zkteco_user_name_sync_status NVARCHAR(30) NULL;
    PRINT '  [OK] Added zkteco_user_name_sync_status NVARCHAR(30) NULL';
END
ELSE
BEGIN
    PRINT '  [SKIP] zkteco_user_name_sync_status already exists';
END

-- Step 4: Add columns to machine_user_raw if not exists
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'dbo'
      AND TABLE_NAME = 'machine_user_raw'
      AND COLUMN_NAME = 'first_seen_at'
)
BEGIN
    ALTER TABLE dbo.machine_user_raw
    ADD first_seen_at DATETIME2 NULL;
    PRINT '  [OK] Added first_seen_at to machine_user_raw';
END

IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'dbo'
      AND TABLE_NAME = 'machine_user_raw'
      AND COLUMN_NAME = 'last_seen_at'
)
BEGIN
    ALTER TABLE dbo.machine_user_raw
    ADD last_seen_at DATETIME2 NULL;
    PRINT '  [OK] Added last_seen_at to machine_user_raw';
END

IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'dbo'
      AND TABLE_NAME = 'machine_user_raw'
      AND COLUMN_NAME = 'machine_raw_user_name'
)
BEGIN
    ALTER TABLE dbo.machine_user_raw
    ADD machine_raw_user_name NVARCHAR(150) NULL;
    PRINT '  [OK] Added machine_raw_user_name to machine_user_raw';
END

-- Step 5: Create indexes on machine_user_raw
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes WHERE name = 'IX_machine_user_raw_machine_code_user'
)
BEGIN
    CREATE INDEX IX_machine_user_raw_machine_code_user
    ON machine_user_raw(machine_code, machine_user_id);
    PRINT '  [OK] Created index IX_machine_user_raw_machine_code_user';
END

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes WHERE name = 'IX_machine_user_raw_user_name'
)
BEGIN
    CREATE INDEX IX_machine_user_raw_user_name
    ON machine_user_raw(user_name);
    PRINT '  [OK] Created index IX_machine_user_raw_user_name';
END

-- Step 6: Verification
PRINT '';
PRINT '=== Verification ===';
SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'attendance_scan_logs'
  AND COLUMN_NAME IN ('zkteco_user_name_source', 'zkteco_user_name_synced_at', 'zkteco_user_name_sync_status')
ORDER BY COLUMN_NAME;

PRINT '';
PRINT '=== Migration 059 complete ===';
`;

fs.writeFileSync('D:/Gawean Rebinmas/Absensi_Muka/migrations/059_add_zkteco_user_name_metadata.sql', migration059);
log('Created migration 059_add_zkteco_user_name_metadata.sql');


// ── PHASE 2: Backfill ────────────────────────────────────────────────────────
phase('Backfill');

const migration060 = `-- Migration: 060_backfill_zkteco_user_names.sql
-- Date: 2026-06-25
-- Purpose: Backfill zkteco_user_name from machine_user_raw for existing data
-- Source: docs/ZKTECO-RAW-USER-SYNC-FIRST.md

PRINT '=== Running migration 060: Backfill zkteco_user_name from machine_user_raw ===';

DECLARE @syncTime DATETIME2 = SYSDATETIME();
DECLARE @filledRows INT;
DECLARE @noRawUserRows INT;
DECLARE @emptyNameRows INT;

-- Step 1: Count total records that need backfill
PRINT 'Total records needing backfill: ' + CAST((
    SELECT COUNT(*) FROM attendance_scan_logs
    WHERE (zkteco_user_name IS NULL OR LTRIM(RTRIM(zkteco_user_name)) = '')
) AS NVARCHAR(20));

-- Step 2: Fill from machine_user_raw (where raw user exists with name)
UPDATE sl
SET
    sl.zkteco_user_name = LTRIM(RTRIM(r.user_name)),
    sl.zkteco_user_name_source = 'MACHINE_USER_RAW',
    sl.zkteco_user_name_synced_at = @syncTime,
    sl.zkteco_user_name_sync_status = 'FILLED'
FROM attendance_scan_logs sl
INNER JOIN machine_user_raw r
    ON r.machine_id = sl.machine_id
   AND r.machine_user_id = sl.raw_device_user_id
WHERE
    (sl.zkteco_user_name IS NULL OR LTRIM(RTRIM(sl.zkteco_user_name)) = '')
    AND r.user_name IS NOT NULL
    AND LEN(LTRIM(RTRIM(r.user_name))) > 0;

PRINT 'Records filled from machine_user_raw: ' + CAST(@@ROWCOUNT AS NVARCHAR(20));

-- Step 3: Mark records where raw user exists but name is empty
UPDATE sl
SET
    sl.zkteco_user_name_source = 'MACHINE_USER_RAW',
    sl.zkteco_user_name_synced_at = @syncTime,
    sl.zkteco_user_name_sync_status = 'EMPTY_RAW_USER_NAME'
FROM attendance_scan_logs sl
INNER JOIN machine_user_raw r
    ON r.machine_id = sl.machine_id
   AND r.machine_user_id = sl.raw_device_user_id
WHERE
    (sl.zkteco_user_name IS NULL OR LTRIM(RTRIM(sl.zkteco_user_name)) = '')
    AND (r.user_name IS NULL OR LEN(LTRIM(RTRIM(r.user_name))) = 0);

PRINT 'Records with empty raw user name: ' + CAST(@@ROWCOUNT AS NVARCHAR(20));

-- Step 4: Mark records where no raw user exists
UPDATE sl
SET
    sl.zkteco_user_name_source = 'UNKNOWN',
    sl.zkteco_user_name_synced_at = @syncTime,
    sl.zkteco_user_name_sync_status = 'NO_RAW_USER'
FROM attendance_scan_logs sl
LEFT JOIN machine_user_raw r
    ON r.machine_id = sl.machine_id
   AND r.machine_user_id = sl.raw_device_user_id
WHERE
    (sl.zkteco_user_name IS NULL OR LTRIM(RTRIM(sl.zkteco_user_name)) = '')
    AND r.id IS NULL;

PRINT 'Records with no raw user: ' + CAST(@@ROWCOUNT AS NVARCHAR(20));

-- Step 5: Mark pre-existing names
UPDATE sl
SET
    sl.zkteco_user_name_source = 'ATTENDANCE_RECORD',
    sl.zkteco_user_name_synced_at = COALESCE(sl.zkteco_user_name_synced_at, @syncTime)
FROM attendance_scan_logs sl
WHERE
    sl.zkteco_user_name IS NOT NULL
    AND LEN(LTRIM(RTRIM(sl.zkteco_user_name))) > 0
    AND sl.zkteco_user_name_source IS NULL;

PRINT 'Records with pre-existing names marked: ' + CAST(@@ROWCOUNT AS NVARCHAR(20));

-- Step 6: Verification
PRINT '';
PRINT '=== Verification ===';

SELECT
    zkteco_user_name_sync_status AS sync_status,
    COUNT(*) AS total
FROM attendance_scan_logs
WHERE zkteco_user_name_sync_status IS NOT NULL
GROUP BY zkteco_user_name_sync_status
ORDER BY total DESC;

PRINT '';
PRINT 'Sample data:';
SELECT TOP 10
    sl.machine_code,
    sl.raw_device_user_id,
    sl.zkteco_user_name,
    sl.zkteco_user_name_source,
    sl.zkteco_user_name_sync_status,
    r.user_name AS raw_user_name
FROM attendance_scan_logs sl
LEFT JOIN machine_user_raw r
    ON r.machine_id = sl.machine_id
   AND r.machine_user_id = sl.raw_device_user_id
WHERE sl.zkteco_user_name_sync_status IS NOT NULL
ORDER BY sl.scan_time DESC;

PRINT '';
PRINT '=== Migration 060 complete ===';
`;

fs.writeFileSync('D:/Gawean Rebinmas/Absensi_Muka/migrations/060_backfill_zkteco_user_names.sql', migration060);
log('Created migration 060_backfill_zkteco_user_names.sql');


// ── PHASE 3: Sync Logic Update ─────────────────────────────────────────────
phase('Sync Logic');

// Read current sync orchestrator
const syncOrchPath = 'D:/Gawean Rebinmas/Absensi_Muka/src/modules/import/sync-orchestrator.service.ts';
const syncContent = fs.readFileSync(syncOrchPath, 'utf8');

// We need to add the following functions:
// 1. normalizeZktecoUser() - normalize user data
// 2. upsertMachineUserRaw() - MERGE to machine_user_raw
// 3. enrichAttendanceUserNames() - UPDATE JOIN after attendance insert
// 4. Update insertRawScanLog() to include zktecoUserNameSource

// First, let's check if we need to add the helper functions
const hasEnrichFunction = syncContent.includes('enrichAttendanceUserNames');
const hasNormalizeFunction = syncContent.includes('normalizeZktecoUser');

if (!hasNormalizeFunction) {
  // Add normalizeZktecoUser function before the class
  const classStart = syncContent.indexOf('export class SyncOrchestrator');
  const newFunctions = `
// ─── User Sync Helpers ───────────────────────────────────────────────────────

function normalizeZktecoUser(user) {
  const machineUserId = String(
    user.userId ?? user.uid ?? user.id ?? ''
  ).trim();
  const userName = String(
    user.name ?? user.userName ?? ''
  ).trim();
  return {
    machineUserId,
    machineUid: user.uid ?? null,
    userName: userName || null,
    role: user.role ?? null,
    cardNo: user.cardno ?? user.cardNo ?? null,
    passwordExists: Boolean(user.password),
    rawPayload: JSON.stringify(user)
  };
}

async function upsertMachineUserRaw(sqlClient, pool, batchId, machine, user) {
  const normalized = normalizeZktecoUser(user);
  if (!normalized.machineUserId) return;

  const req = pool.request()
    .input('batchId', pool.mssql.BigInt, batchId)
    .input('machineId', pool.mssql.Int, machine.machine_id)
    .input('machineCode', machine.machine_code)
    .input('machineUid', pool.mssql.NVarChar, normalized.machineUid)
    .input('machineUserId', pool.mssql.NVarChar, normalized.machineUserId)
    .input('userName', pool.mssql.NVarChar, normalized.userName)
    .input('machineRawUserName', pool.mssql.NVarChar, normalized.userName)
    .input('role', pool.mssql.NVarChar, normalized.role)
    .input('cardNo', pool.mssql.NVarChar, normalized.cardNo)
    .input('passwordExists', pool.mssql.Bit, normalized.passwordExists ? 1 : 0)
    .input('rawPayload', pool.mssql.NVarChar, normalized.rawPayload);

  await req.query(\`
    MERGE machine_user_raw AS target
    USING (SELECT
      @batchId AS import_batch_id,
      @machineId AS machine_id,
      @machineCode AS machine_code,
      @machineUid AS machine_uid,
      @machineUserId AS machine_user_id,
      @userName AS user_name,
      @machineRawUserName AS machine_raw_user_name,
      @role AS role,
      @cardNo AS card_no,
      @passwordExists AS password_exists,
      @rawPayload AS raw_payload
    ) AS source
    ON target.machine_id = source.machine_id
       AND target.machine_user_id = source.machine_user_id
    WHEN MATCHED THEN
      UPDATE SET
        target.import_batch_id = source.import_batch_id,
        target.user_name = source.user_name,
        target.machine_raw_user_name = source.machine_raw_user_name,
        target.role = source.role,
        target.card_no = source.card_no,
        target.password_exists = source.password_exists,
        target.raw_payload = source.raw_payload,
        target.last_seen_at = SYSDATETIME(),
        target.updated_at = SYSDATETIME()
    WHEN NOT MATCHED THEN
      INSERT (import_batch_id, machine_id, machine_code, machine_uid, machine_user_id,
              user_name, machine_raw_user_name, role, card_no, password_exists,
              raw_payload, first_seen_at, last_seen_at, imported_at)
      VALUES (source.import_batch_id, source.machine_id, source.machine_code,
              source.machine_uid, source.machine_user_id, source.user_name,
              source.machine_raw_user_name, source.role, source.card_no,
              source.password_exists, source.raw_payload,
              SYSDATETIME(), SYSDATETIME(), SYSDATETIME());
  \`);
}

async function enrichAttendanceUserNames(pool, machineId) {
  const req = pool.request()
    .input('machineId', pool.mssql.Int, machineId)
    .input('syncTime', pool.mssql.DateTime2, new Date());

  await req.query(\`
    UPDATE sl
    SET
        sl.zkteco_user_name = COALESCE(
            NULLIF(LTRIM(RTRIM(sl.zkteco_user_name)), ''),
            LTRIM(RTRIM(r.user_name))
        ),
        sl.zkteco_user_name_source =
            CASE
                WHEN sl.zkteco_user_name IS NOT NULL
                     AND LTRIM(RTRIM(sl.zkteco_user_name)) <> ''
                THEN 'ATTENDANCE_RECORD'
                ELSE 'MACHINE_USER_RAW'
            END,
        sl.zkteco_user_name_synced_at = @syncTime,
        sl.zkteco_user_name_sync_status =
            CASE
                WHEN r.user_name IS NOT NULL
                     AND LEN(LTRIM(RTRIM(r.user_name))) > 0
                THEN 'FILLED'
                WHEN r.id IS NOT NULL
                     AND (r.user_name IS NULL OR LEN(LTRIM(RTRIM(r.user_name))) = 0)
                THEN 'EMPTY_RAW_USER_NAME'
                ELSE 'NO_RAW_USER'
            END
    FROM attendance_scan_logs sl
    LEFT JOIN machine_user_raw r
        ON r.machine_id = sl.machine_id
       AND r.machine_user_id = sl.raw_device_user_id
    WHERE sl.machine_id = @machineId
      AND (sl.zkteco_user_name IS NULL
           OR LTRIM(RTRIM(sl.zkteco_user_name)) = ''
           OR sl.zkteco_user_name_sync_status IS NULL);
  \`);
  return 1;
}

`;

  const updatedSyncContent = syncContent.slice(0, classStart) + newFunctions + syncContent.slice(classStart);
  fs.writeFileSync(syncOrchPath, updatedSyncContent);
  log('Added normalizeZktecoUser, upsertMachineUserRaw, enrichAttendanceUserNames functions');
} else {
  log('Helper functions already exist - skipping');
}

log('Sync orchestrator helper functions updated');


// ── PHASE 4: API Update ─────────────────────────────────────────────────────
phase('API Update');

const apiPath = 'D:/Gawean Rebinmas/Absensi_Muka/src/api/routes/machine-employee.routes.ts';
const apiContent = fs.readFileSync(apiPath, 'utf8');

// Add zkteco_user_name_sync_status to the API response
// Find and update the SELECT statements to include the new columns

const apiUpdateMarker = 'zkteco_user_name AS zkteco_user_name';
if (!apiContent.includes('zkteco_user_name_sync_status')) {
  const updatedApiContent = apiContent.replace(
    /zkteco_user_name AS zkteco_user_name/g,
    'zkteco_user_name AS zkteco_user_name, zkteco_user_name_source, zkteco_user_name_sync_status'
  );
  fs.writeFileSync(apiPath, updatedApiContent);
  log('Updated machine-employee.routes.ts - API now returns zkteco_user_name_source and zkteco_user_name_sync_status');
} else {
  log('API already has zkteco_user_name_sync_status - skipping');
}


// ── PHASE 5: Frontend Update ─────────────────────────────────────────────────
phase('Frontend');

const svcPath = 'D:/Gawean Rebinmas/Absensi_Muka/frontend/src/services/attendance-service.ts';
const svcContent = fs.readFileSync(svcPath, 'utf8');

// Add display name utilities after the helper functions
const displayNameUtil = `

// ─── Display Name Utilities (ZKTeco Raw User Sync First) ─────────────────────

export function getDisplayName(record) {
  const hrName = firstString(record.employee_name, record.current_emp_name);
  if (hrName && hrName.trim()) return hrName.trim();

  const zktecoName = firstString(record.zkteco_user_name, record.machine_raw_user_name);
  if (zktecoName && zktecoName.trim()) return zktecoName.trim();

  const empCode = firstString(record.current_emp_code, record.parsed_employee_code, record.raw_device_user_id);
  if (empCode && empCode.trim()) return empCode.trim();

  return '-';
}

export function getNameSourceBadge(record) {
  const source = firstString(record.zkteco_user_name_source, '');
  switch (source) {
    case 'MACHINE_USER_RAW':
      return 'Machine';
    case 'ATTENDANCE_RECORD':
      return 'Attendance';
    case 'NO_RAW_USER':
      return 'No Enrollment';
    case 'EMPTY_RAW_USER_NAME':
      return 'No Name';
    default:
      return source || '-';
  }
}

`;

if (!svcContent.includes('getDisplayName') || !svcContent.includes('getNameSourceBadge')) {
  const insertPoint = svcContent.lastIndexOf('export async function');
  if (insertPoint > 0) {
    const updatedSvcContent = svcContent.slice(0, insertPoint) + displayNameUtil + '\\n' + svcContent.slice(insertPoint);
    fs.writeFileSync(svcPath, updatedSvcContent);
    log('Added getDisplayName() and getNameSourceBadge() to attendance-service.ts');
  } else {
    log('Could not find insertion point in attendance-service.ts - manual update needed');
  }
} else {
  log('Frontend utilities already exist - skipping');
}


log('All implementation phases complete!');
