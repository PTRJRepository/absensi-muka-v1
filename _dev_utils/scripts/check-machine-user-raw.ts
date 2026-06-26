import mssql from 'mssql';

const dbConfig = {
  server: '10.0.0.110',
  port: 1433,
  user: 'sa',
  password: process.env.DB_PASSWORD || '<DB_PASSWORD>',
  database: 'rebinmas_absensi_monitoring',
  options: { encrypt: false, trustServerCertificate: true },
};

async function main() {
  const pool = await mssql.connect(dbConfig);

  console.log('=== columns of machine_user_raw ===');
  const cols = await pool.request().query(`
    SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'machine_user_raw'
  `);
  for (const c of cols.recordset) {
    console.log(`  ${c.COLUMN_NAME}: ${c.DATA_TYPE} (${c.CHARACTER_MAXIMUM_LENGTH}) nullable=${c.IS_NULLABLE}`);
  }

  console.log('=== indexes of machine_user_raw ===');
  const indexes = await pool.request().query(`
    SELECT 
        i.name AS IndexName,
        i.is_unique AS IsUnique,
        i.type_desc AS IndexType
    FROM sys.indexes i
    INNER JOIN sys.tables t ON i.object_id = t.object_id
    WHERE t.name = 'machine_user_raw'
  `);
  for (const idx of indexes.recordset) {
    console.log(`  ${idx.IndexName}: unique=${idx.IsUnique}, type=${idx.IndexType}`);
  }

  await pool.close();
}

main().catch(console.error);
