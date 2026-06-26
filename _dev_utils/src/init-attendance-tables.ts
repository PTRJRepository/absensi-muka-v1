/**
 * Inisialisasi Tabel Absensi V2 — employee attendance daily system
 * Target: extend_db_ptrj via SQL Gateway
 *
 * Tables:
 *   1. mst_division        - Master 14 divisi
 *   2. mst_machine         - Master 15 mesin absensi
 *   3. mst_employee       - Master karyawan + home_division
 *   4. attendance_scan_log         - Raw scan events (N baris per karyawan per hari)
 *   5. employee_attendance_daily    - Agregasi final: 1 baris per karyawan per hari
 *   6. attendance_manual_input     - Input manual: sakit, izin, tugas luar
 *   7. attendance_work_config      - Konfigurasi jam kerja per hari
 *   8. attendance_sorting_result   - Audit trail hasil sortir divisi
 *   9. attendance_holiday           - Libur nasional / company event
 */

import { sqlClient } from "./sql-client.ts";

async function tableExists(name: string): Promise<boolean> {
  try {
    return await sqlClient.tableExists(name);
  } catch {
    return false;
  }
}

async function createTable(sql: string): Promise<void> {
  await sqlClient.execute(sql);
}

async function seed(sql: string): Promise<void> {
  await sqlClient.execute(sql);
}

// ─────────────────────────────────────────────
// 1. mst_division
// ─────────────────────────────────────────────
async function createMstDivision() {
  if (await tableExists("mst_division")) {
    console.log("  ⏩ mst_division already exists");
    return;
  }
  await createTable(`
    CREATE TABLE mst_division (
      division_id INT IDENTITY(1,1) PRIMARY KEY,
      division_code NVARCHAR(20) NOT NULL UNIQUE,
      division_name NVARCHAR(100) NOT NULL,
      loc_code NCHAR(1) NULL,
      scanner_code INT NULL,
      is_active BIT DEFAULT 1,
      created_at DATETIME DEFAULT GETDATE()
    );
  `);

  const divisions = [
    ["PG1A", "Kebun PG1A", "A"],
    ["PG1B", "Kebun PG1B", "B"],
    ["PG2A", "Kebun PG2A", "C"],
    ["PG2B", "Kebun PG2B", "D"],
    ["DME", "DME Mill", "E"],
    ["ARA", "Kebun ARA", "F"],
    ["ARB1", "Kebun ARB1", "G"],
    ["ARB2", "Kebun ARB2", "H"],
    ["AREC", "Area Control", "J"],
    ["IJL", "IJL", "L"],
    ["INFRA", "Infrastructure", NULL],
    ["STF-OFFICE", "Staff Office", NULL],
    ["SECURITY", "Security", NULL],
    ["NULL-DIV", "Tanpa Divisi", NULL],
  ];

  for (const [code, name, loc] of divisions) {
    await seed(
      `INSERT INTO mst_division (division_code, division_name, loc_code) VALUES ('${code}', N'${name}', ${loc ? "'" + loc + "'" : 'NULL'})`
    );
  }
  console.log("  ✅ mst_division created + seeded (14 rows)");
}

// ─────────────────────────────────────────────
// 2. mst_machine
// ─────────────────────────────────────────────
async function createMstMachine() {
  if (await tableExists("mst_machine")) {
    console.log("  ⏩ mst_machine already exists");
    return;
  }
  await createTable(`
    CREATE TABLE mst_machine (
      machine_id INT IDENTITY(1,1) PRIMARY KEY,
      machine_code NVARCHAR(30) NOT NULL UNIQUE,
      machine_name NVARCHAR(100) NOT NULL,
      machine_ip NVARCHAR(50) NULL,
      machine_port INT NULL,
      division_id INT NULL,
      scanner_code INT NULL,
      loc_code NCHAR(1) NULL,
      is_online BIT DEFAULT 0,
      is_active BIT DEFAULT 1,
      created_at DATETIME DEFAULT GETDATE(),
      CONSTRAINT FK_machine_division FOREIGN KEY (division_id) REFERENCES mst_division(division_id)
    );
  `);

  // Seed machines — division_id resolved via subquery
  const machines = [
    ["PGE",    " kantor PGE",       "10.0.0.232",     4370, null, null, "A"],
    ["MILL",   " Mill Office",      "103.127.66.32",  4370, null, null, null],
    ["DME_01", "DME Absensi 01",    "103.144.228.42", 4700, null, 700,  "E"],
    ["DME_02", "DME Absensi 02",    "103.144.228.42", 4701, null, 700,  "E"],
    ["ARE",    " kantor ARE",       "103.144.208.154",4370, null, null,  null],
    ["IJL",    "I JL",             "103.144.211.226",4370, null, null,  "L"],
    ["ARA",    "Kebun ARA",        "103.144.208.154",4800, null, 800,  "F"],
    ["AB1",    "Kebun AB1",        "103.144.208.154",4900, null, 900,  "G"],
    ["AB2",    "Kebun AB2",        "103.144.208.154",4400, null, 400,  "H"],
    ["ARC_01", "ARC 01",           "103.144.208.154",4200, null, 200,  "J"],
    ["ARC_02", "ARC 02",           "103.144.208.154",4201, null, 200,  "J"],
    ["P1A",    "P1A - Unknown",    "223.25.98.220",  4100, null, 100,  "A"],
    ["P1B",    "P1B - Unknown",    "223.25.98.220",  4300, null, 300,  "B"],
    ["P2A",    "P2A - Unknown",    "223.25.98.220",  4500, null, 500,  "C"],
    ["P2B",    "P2B - Unknown",    "223.25.98.220",  4600, null, 600,  "D"],
  ];

  for (const [code, name, ip, port, divId, sc, loc] of machines) {
    const locVal = loc ? `'${loc}'` : 'NULL';
    const scVal = sc ? `${sc}` : 'NULL';
    const divQuery = loc && loc !== 'null' && loc !== '' && loc !== null
      ? `(SELECT division_id FROM mst_division WHERE loc_code = '${loc}')`
      : 'NULL';
    await seed(`
      INSERT INTO mst_machine (machine_code, machine_name, machine_ip, machine_port, division_id, scanner_code, loc_code)
      VALUES ('${code}', N'${name}', '${ip}', ${port}, ${divQuery}, ${scVal}, ${locVal})
    `);
  }
  console.log("  ✅ mst_machine created + seeded (15 rows)");
}

// ─────────────────────────────────────────────
// 3. attendance_scan_log
// ─────────────────────────────────────────────
async function createAttendanceScanLog() {
  if (await tableExists("attendance_scan_log")) {
    console.log("  ⏩ attendance_scan_log already exists");
    return;
  }
  await createTable(`
    CREATE TABLE attendance_scan_log (
      scan_id BIGINT IDENTITY(1,1) PRIMARY KEY,
      emp_code NVARCHAR(50) NOT NULL,
      machine_id INT NULL,
      scan_time DATETIME NOT NULL,
      work_date DATE NOT NULL,
      raw_source NVARCHAR(20) DEFAULT 'ZKTECO',
      raw_uid NVARCHAR(50) NULL,
      created_at DATETIME DEFAULT GETDATE(),
      CONSTRAINT FK_scanlog_machine FOREIGN KEY (machine_id) REFERENCES mst_machine(machine_id)
    );
  `);

  // No seed data needed for scan log
  console.log("  ✅ attendance_scan_log created");
}

// ─────────────────────────────────────────────
// 4. mst_employee
// ─────────────────────────────────────────────
async function createMstEmployee() {
  if (await tableExists("mst_employee")) {
    console.log("  ⏩ mst_employee already exists");
    return;
  }
  await createTable(`
    CREATE TABLE mst_employee (
      employee_id INT IDENTITY(1,1) PRIMARY KEY,
      emp_code NVARCHAR(50) NOT NULL UNIQUE,
      emp_name NVARCHAR(255) NULL,
      nik NVARCHAR(50) NULL,
      division_id INT NULL,
      job_position NVARCHAR(100) NULL,
      is_active BIT DEFAULT 1,
      created_at DATETIME DEFAULT GETDATE(),
      updated_at DATETIME DEFAULT GETDATE(),
      CONSTRAINT FK_employee_division FOREIGN KEY (division_id) REFERENCES mst_division(division_id)
    );
  `);
  console.log("  ✅ mst_employee created (empty - seed dari hasil mapping)");
}

// ─────────────────────────────────────────────
// 5. attendance_work_config
// ─────────────────────────────────────────────
async function createAttendanceWorkConfig() {
  if (await tableExists("attendance_work_config")) {
    console.log("  ⏩ attendance_work_config already exists");
    return;
  }
  await createTable(`
    CREATE TABLE attendance_work_config (
      config_id INT IDENTITY(1,1) PRIMARY KEY,
      day_of_week TINYINT NOT NULL,
      day_name NVARCHAR(20) NOT NULL,
      working_minutes INT NOT NULL,
      is_workday BIT DEFAULT 1,
      created_at DATETIME DEFAULT GETDATE(),
      UNIQUE (day_of_week)
    );
  `);

  // Seed standard working minutes
  // Backend uses JavaScript convention: 0=Sunday, 1=Monday, ..., 6=Saturday
  const configs = [
    [0, "Sunday",      0, 0],
    [1, "Monday",    420, 1],
    [2, "Tuesday",   420, 1],
    [3, "Wednesday", 420, 1],
    [4, "Thursday",  420, 1],
    [5, "Friday",    300, 1],
    [6, "Saturday",    0, 0],
  ];

  for (const [dow, name, mins, workday] of configs) {
    await seed(
      `INSERT INTO attendance_work_config (day_of_week, day_name, working_minutes, is_workday) VALUES (${dow}, N'${name}', ${mins}, ${workday})`
    );
  }
  console.log("  ✅ attendance_work_config created + seeded (7 rows)");
}

// ─────────────────────────────────────────────
// 6. attendance_manual_input
// ─────────────────────────────────────────────
async function createAttendanceManualInput() {
  if (await tableExists("attendance_manual_input")) {
    console.log("  ⏩ attendance_manual_input already exists");
    return;
  }
  await createTable(`
    CREATE TABLE attendance_manual_input (
      input_id BIGINT IDENTITY(1,1) PRIMARY KEY,
      emp_code NVARCHAR(50) NOT NULL,
      work_date DATE NOT NULL,
      manual_type NVARCHAR(30) NOT NULL,
      start_time DATETIME NULL,
      end_time DATETIME NULL,
      note NVARCHAR(500) NULL,
      approved_by NVARCHAR(100) NULL,
      created_by NVARCHAR(100) NULL,
      created_at DATETIME DEFAULT GETDATE(),
      UNIQUE (emp_code, work_date, manual_type)
    );
  `);
  // No seed data
  console.log("  ✅ attendance_manual_input created");
}

// ─────────────────────────────────────────────
// 7. attendance_sorting_result
// ─────────────────────────────────────────────
async function createAttendanceSortingResult() {
  if (await tableExists("attendance_sorting_result")) {
    console.log("  ⏩ attendance_sorting_result already exists");
    return;
  }
  await createTable(`
    CREATE TABLE attendance_sorting_result (
      sorting_id BIGINT IDENTITY(1,1) PRIMARY KEY,
      emp_code NVARCHAR(50) NOT NULL,
      employee_id INT NULL,
      work_date DATE NOT NULL,

      scan_count INT DEFAULT 0,

      scan_division_id INT NULL,
      home_division_id INT NULL,
      final_division_id INT NOT NULL,

      sorting_status NVARCHAR(50) NOT NULL,
      sorting_rule NVARCHAR(100) NULL,
      is_cross_division_scan BIT DEFAULT 0,
      need_review BIT DEFAULT 0,
      note NVARCHAR(500) NULL,

      sorted_by NVARCHAR(100) DEFAULT 'SYSTEM',
      sorted_at DATETIME DEFAULT GETDATE(),

      CONSTRAINT FK_sorting_employee FOREIGN KEY (employee_id) REFERENCES mst_employee(employee_id),
      CONSTRAINT FK_sorting_scan_division FOREIGN KEY (scan_division_id) REFERENCES mst_division(division_id),
      CONSTRAINT FK_sorting_home_division FOREIGN KEY (home_division_id) REFERENCES mst_division(division_id),
      CONSTRAINT FK_sorting_final_division FOREIGN KEY (final_division_id) REFERENCES mst_division(division_id),
      UNIQUE (emp_code, work_date)
    );
  `);
  console.log("  ✅ attendance_sorting_result created");
}

// ─────────────────────────────────────────────
// 8. employee_attendance_daily
// ─────────────────────────────────────────────
async function createEmployeeAttendanceDaily() {
  if (await tableExists("employee_attendance_daily")) {
    console.log("  ⏩ employee_attendance_daily already exists");
    return;
  }
  await createTable(`
    CREATE TABLE employee_attendance_daily (
      daily_id BIGINT IDENTITY(1,1) PRIMARY KEY,
      emp_code NVARCHAR(50) NOT NULL,
      employee_id INT NULL,
      work_date DATE NOT NULL,

      first_scan_time DATETIME NULL,
      last_scan_time DATETIME NULL,
      scan_count INT DEFAULT 0,
      scan_machines NVARCHAR(500) NULL,

      work_duration_minutes INT NULL,
      overtime_minutes INT DEFAULT 0,
      is_overtime BIT DEFAULT 0,
      is_estimated_duration BIT DEFAULT 0,

      attendance_status NVARCHAR(30) NOT NULL,
      status_note NVARCHAR(500) NULL,

      final_division_id INT NOT NULL,
      home_division_id INT NULL,
      is_cross_division_scan BIT DEFAULT 0,

      source NVARCHAR(20) DEFAULT 'MACHINE',

      created_at DATETIME DEFAULT GETDATE(),
      updated_at DATETIME DEFAULT GETDATE(),

      CONSTRAINT FK_daily_employee FOREIGN KEY (employee_id) REFERENCES mst_employee(employee_id),
      CONSTRAINT FK_daily_division FOREIGN KEY (final_division_id) REFERENCES mst_division(division_id),
      UNIQUE (emp_code, work_date)
    );
  `);
  console.log("  ✅ employee_attendance_daily created");
}

// ─────────────────────────────────────────────
// 9. attendance_holiday
// ─────────────────────────────────────────────
async function createAttendanceHoliday() {
  if (await tableExists("attendance_holiday")) {
    console.log("  ⏩ attendance_holiday already exists");
    return;
  }
  await createTable(`
    CREATE TABLE attendance_holiday (
      holiday_id INT IDENTITY(1,1) PRIMARY KEY,
      holiday_date DATE NOT NULL,
      holiday_name NVARCHAR(255) NOT NULL,
      holiday_type NVARCHAR(20) DEFAULT 'NATIONAL',
      is_active BIT DEFAULT 1,
      created_at DATETIME DEFAULT GETDATE(),
      UNIQUE (holiday_date)
    );
  `);
  console.log("  ✅ attendance_holiday created");
}

// ─────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────
async function main() {
  console.log("\n=== Inisialisasi Tabel Absensi V2 ===");
  console.log("Database: extend_db_ptrj\n");

  console.log("[1/9] mst_division...");
  await createMstDivision();

  console.log("[2/9] mst_machine...");
  await createMstMachine();

  console.log("[3/9] attendance_scan_log...");
  await createAttendanceScanLog();

  console.log("[4/9] mst_employee...");
  await createMstEmployee();

  console.log("[5/9] attendance_work_config...");
  await createAttendanceWorkConfig();

  console.log("[6/9] attendance_manual_input...");
  await createAttendanceManualInput();

  console.log("[7/9] attendance_sorting_result...");
  await createAttendanceSortingResult();

  console.log("[8/9] employee_attendance_daily...");
  await createEmployeeAttendanceDaily();

  console.log("[9/9] attendance_holiday...");
  await createAttendanceHoliday();

  console.log("\n=== ✅ Semua tabel berhasil dibuat ===\n");
  console.log("Langkah selanjutnya:");
  console.log("  1. Seed mst_employee: mapping deviceUserId → emp_code + home_division");
  console.log("  2. Parser absen_import → attendance_scan_log");
  console.log("  3. Proses agregasi + sorting per hari\n");
}

main().catch(console.error);
