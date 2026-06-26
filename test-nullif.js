const mssql = require('mssql');
const cfg = {
  server: '10.0.0.110',
  port: 1433,
  user: 'sa',
  password: process.env.DB_PASSWORD || '<DB_PASSWORD>',
  database: 'rebinmas_absensi_monitoring',
  options: { encrypt: false, trustServerCertificate: true }
};

(async () => {
  try {
    const pool = await mssql.connect(cfg);

    // Test 2 paren version
    try {
      const q1 = "SELECT TOP 1 NULLIF(LTRIM(RTRIM(parsed_employee_code)), '') AS test FROM attendance_scan_logs";
      const r1 = await pool.request().query(q1);
      console.log('2 parens OK:', r1.recordset[0]);
    } catch (e1) {
      console.log('2 parens ERROR:', e1.message.substring(0, 150));
    }

    // Test 3 paren version
    try {
      const q2 = "SELECT TOP 1 NULLIF(LTRIM(RTRIM(parsed_employee_code))), '') AS test FROM attendance_scan_logs";
      const r2 = await pool.request().query(q2);
      console.log('3 parens OK:', r2.recordset[0]);
    } catch (e2) {
      console.log('3 parens ERROR:', e2.message.substring(0, 150));
    }

    await pool.close();
  } catch (e) {
    console.error('Connection ERROR:', e.message.substring(0, 150));
  }
})();
