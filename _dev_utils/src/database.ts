import { sqlClient } from "./sql-client.ts";

/**
 * Schema untuk tabel-tabel absensi
 * Aturan:
 * - absen_import: Data dari mesin (IMUTABLE - tidak bisa diubah/hapus)
 * - absen_machine_input: Data input mesin (BISA di-edit/add/overwrite)
 * - absen_verification: Gabungan import + machine input untuk verifikasi
 */

// Schema: Data dari mesin (IMUTABLE)
export const ABSEN_IMPORT_SCHEMA = `
  CREATE TABLE absen_import (
    id INT IDENTITY(1,1) PRIMARY KEY,
    emp_code NVARCHAR(50) NOT NULL,
    emp_name NVARCHAR(255),
    gang_code NVARCHAR(50),
    division NVARCHAR(50) NOT NULL,
    year INT NOT NULL,
    month INT NOT NULL,
    day INT NOT NULL,
    has_work BIT DEFAULT 0,
    is_sunday BIT DEFAULT 0,
    is_holiday BIT DEFAULT 0,
    holiday_desc NVARCHAR(255),
    is_cuti BIT DEFAULT 0,
    is_sakit BIT DEFAULT 0,
    task_code NVARCHAR(50),
    ot_hours DECIMAL(5,2) DEFAULT 0,
    attendance_date DATE NOT NULL,
    import_batch_id NVARCHAR(100),
    imported_at DATETIME DEFAULT GETDATE(),
    source NVARCHAR(50) DEFAULT 'MACHINE',
    is_locked BIT DEFAULT 1,
    UNIQUE (emp_code, division, year, month, day, import_batch_id)
  );
`;

// Schema: Data input mesin (BISA di-edit/add/overwrite)
export const ABSEN_MACHINE_INPUT_SCHEMA = `
  CREATE TABLE absen_machine_input (
    id INT IDENTITY(1,1) PRIMARY KEY,
    emp_code NVARCHAR(50) NOT NULL,
    emp_name NVARCHAR(255),
    gang_code NVARCHAR(50),
    division NVARCHAR(50) NOT NULL,
    year INT NOT NULL,
    month INT NOT NULL,
    day INT NOT NULL,
    has_work BIT DEFAULT 0,
    is_sunday BIT DEFAULT 0,
    is_holiday BIT DEFAULT 0,
    holiday_desc NVARCHAR(255),
    is_cuti BIT DEFAULT 0,
    is_sakit BIT DEFAULT 0,
    task_code NVARCHAR(50),
    ot_hours DECIMAL(5,2) DEFAULT 0,
    attendance_date DATE NOT NULL,
    input_type NVARCHAR(20) DEFAULT 'MANUAL',
    created_at DATETIME DEFAULT GETDATE(),
    updated_at DATETIME DEFAULT GETDATE(),
    created_by NVARCHAR(100),
    notes NVARCHAR(500),
    UNIQUE (emp_code, division, year, month, day)
  );
`;

// Schema: Log perubahan untuk tracking
export const ABSEN_CHANGE_LOG_SCHEMA = `
  CREATE TABLE absen_change_log (
    id INT IDENTITY(1,1) PRIMARY KEY,
    emp_code NVARCHAR(50) NOT NULL,
    division NVARCHAR(50) NOT NULL,
    year INT NOT NULL,
    month INT NOT NULL,
    day INT NOT NULL,
    field_name NVARCHAR(50),
    old_value NVARCHAR(MAX),
    new_value NVARCHAR(MAX),
    change_type NVARCHAR(20) NOT NULL,
    source_table NVARCHAR(50),
    changed_by NVARCHAR(100),
    changed_at DATETIME DEFAULT GETDATE()
  );
`;

// Schema: Tabel untuk tracking import
export const ABSEN_IMPORT_BATCH_SCHEMA = `
  CREATE TABLE absen_import_batch (
    id INT IDENTITY(1,1) PRIMARY KEY,
    batch_id NVARCHAR(100) UNIQUE NOT NULL,
    division NVARCHAR(50) NOT NULL,
    year INT NOT NULL,
    month INT NOT NULL,
    total_records INT DEFAULT 0,
    imported_records INT DEFAULT 0,
    status NVARCHAR(50) DEFAULT 'PENDING',
    import_started_at DATETIME DEFAULT GETDATE(),
    import_completed_at DATETIME,
    error_message NVARCHAR(MAX),
    imported_by NVARCHAR(100) DEFAULT 'SYSTEM'
  );
`;

// Schema untuk tabel config
export const ABSEN_CONFIG_SCHEMA = `
  CREATE TABLE absen_config (
    id INT IDENTITY(1,1) PRIMARY KEY,
    config_key NVARCHAR(100) UNIQUE NOT NULL,
    config_value NVARCHAR(MAX),
    description NVARCHAR(500),
    updated_at DATETIME DEFAULT GETDATE()
  );
`;

// Schema untuk tabel sync log
export const ABSEN_SYNC_LOG_SCHEMA = `
  CREATE TABLE absen_sync_log (
    id INT IDENTITY(1,1) PRIMARY KEY,
    sync_date DATETIME DEFAULT GETDATE(),
    division NVARCHAR(50),
    year INT,
    month INT,
    mode NVARCHAR(10),
    records_synced INT DEFAULT 0,
    status NVARCHAR(50) DEFAULT 'SUCCESS',
    error_message NVARCHAR(MAX),
    duration_ms INT DEFAULT 0
  );
`;

/**
 * Buat semua tabel yang diperlukan
 */
export async function createTables(): Promise<void> {
  const tables = [
    { name: "absen_import", schema: ABSEN_IMPORT_SCHEMA },
    { name: "absen_machine_input", schema: ABSEN_MACHINE_INPUT_SCHEMA },
    { name: "absen_change_log", schema: ABSEN_CHANGE_LOG_SCHEMA },
    { name: "absen_import_batch", schema: ABSEN_IMPORT_BATCH_SCHEMA },
    { name: "absen_config", schema: ABSEN_CONFIG_SCHEMA },
    { name: "absen_sync_log", schema: ABSEN_SYNC_LOG_SCHEMA },
  ];

  console.log("Creating tables in extend_db_ptrj...");

  for (const table of tables) {
    const exists = await sqlClient.tableExists(table.name);
    if (!exists) {
      console.log(`Creating table: ${table.name}`);
      await sqlClient.execute(table.schema);
      console.log(`  ✓ Table ${table.name} created`);
    } else {
      console.log(`  ✓ Table ${table.name} already exists`);
    }
  }

  console.log("All tables created successfully!");
}

/**
 * Initialize default config
 */
export async function initConfig(): Promise<void> {
  const defaultConfigs = [
    { key: "sync_interval_minutes", value: "15", description: "Interval sync dalam menit" },
    { key: "last_sync", value: null, description: "Timestamp sync terakhir" },
    { key: "sync_enabled", value: "true", description: "Aktifkan auto sync" },
    { key: "api_base_url", value: "http://10.0.0.110:5176", description: "URL API Absensi" },
  ];

  for (const config of defaultConfigs) {
    try {
      await sqlClient.execute(`
        INSERT INTO absen_config (config_key, config_value, description)
        VALUES ('${config.key}', ${config.value === null ? 'NULL' : `'${config.value}'`}, '${config.description}')
      `);
    } catch (e) {
      // Ignore duplicate key errors
    }
  }
}

/**
 * Drop dan recreate tabel (untuk development)
 */
export async function resetTables(): Promise<void> {
  const tables = [
    "absen_change_log",
    "absen_machine_input",
    "absen_import",
    "absen_import_batch",
    "absen_sync_log",
    "absen_config",
  ];

  console.log("Dropping tables...");

  for (const table of tables) {
    const exists = await sqlClient.tableExists(table);
    if (exists) {
      console.log(`Dropping: ${table}`);
      await sqlClient.execute(`DROP TABLE ${table}`);
    }
  }

  console.log("Recreating tables...");
  await createTables();
}
