import mssql from 'mssql';

const absensiDb = {
  server: '10.0.0.110',
  port: 1433,
  user: 'sa',
  password: process.env.DB_PASSWORD || '<DB_PASSWORD>',
  database: 'rebinmas_absensi_monitoring',
  options: { encrypt: false, trustServerCertificate: true },
};

async function main() {
  const absensi = await mssql.connect(absensiDb);

  // Check attendance_machines structure
  console.log('=== attendance_machines structure ===');
  const machineCols = await absensi.request().query(`
    SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'attendance_machines'
    ORDER BY ORDINAL_POSITION
  `);
  machineCols.recordset.forEach(c => {
    const len = c.CHARACTER_MAXIMUM_LENGTH ? `(${c.CHARACTER_MAXIMUM_LENGTH})` : '';
    console.log(`  ${c.COLUMN_NAME}: ${c.DATA_TYPE}${len}`);
  });

  // Sample data
  console.log('\n=== attendance_machines data ===');
  const machines = await absensi.request().query(`SELECT * FROM attendance_machines`);
  console.table(machines.recordset);

  // Check if there's raw user data from machines
  console.log('\n=== All tables ===');
  const tables = await absensi.request().query(`
    SELECT TABLE_NAME
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_TYPE = 'BASE TABLE'
    ORDER BY TABLE_NAME
  `);
  tables.recordset.forEach(t => console.log(`  ${t.TABLE_NAME}`));

  await absensi.close();
}

main().catch(console.error);
