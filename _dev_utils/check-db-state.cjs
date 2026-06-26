const mssql = require('mssql');

const config = {
  server: '10.0.0.110',
  port: 1433,
  user: 'sa',
  password: process.env.DB_PASSWORD || '<DB_PASSWORD>',
  database: 'rebinmas_absensi_monitoring',
  options: { encrypt: false, trustServerCertificate: true }
};

(async () => {
  try {
    await mssql.connect(config);
    const pool = new mssql.ConnectionPool(config);
    await pool.connect();

    const queries = [
      {
        label: '1. Migration tables exist',
        sql: "SELECT name FROM sys.tables WHERE name LIKE '%time_correction%' OR name LIKE '%time_profile%'"
      },
      {
        label: '2. Scan logs new columns',
        sql: 'SELECT TOP 3 id, machine_code, scan_time, scan_date, time_correction_status, scan_time_original FROM attendance_scan_logs'
      },
      {
        label: '3. Machines new columns',
        sql: 'SELECT TOP 5 machine_code, timezone_mode, clock_status FROM attendance_machines WHERE is_active = 1'
      },
      {
        label: '4. Time profile data',
        sql: 'SELECT machine_code, timezone_mode, offset_minutes, is_active FROM attendance_machine_time_profile ORDER BY machine_code'
      },
      {
        label: '5. Scan logs row count',
        sql: 'SELECT COUNT(*) AS total_rows FROM attendance_scan_logs'
      },
      {
        label: '6. P1B clock bug sample',
        sql: "SELECT TOP 10 id, machine_code, raw_device_user_id, scan_time, scan_date, DATEPART(HOUR, scan_time) AS scan_hour FROM attendance_scan_logs WHERE machine_code = 'P1B' ORDER BY scan_time DESC"
      }
    ];

    for (const q of queries) {
      console.log('\n--- ' + q.label + ' ---');
      const rs = await pool.query(q.sql);
      console.log(JSON.stringify(rs.recordset, null, 2));
    }

    await pool.close();
    await mssql.close();
  } catch (e) {
    console.error('ERROR:', e.message);
    await mssql.close();
  }
})();
