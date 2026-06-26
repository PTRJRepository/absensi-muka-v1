/**
 * Audit db_ptrj untuk NIK
 */
import { query as dbQuery } from '../lib/db';

async function auditDbPtrj() {
  console.log('=== DB_PTRJ SCHEMA - NIK SEARCH ===');
  try {
    const schema = await dbQuery(`
      SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE
      FROM [DESKTOP-U5GUJPG].DB_PTRJ.INFORMATION_SCHEMA.COLUMNS
      WHERE COLUMN_NAME LIKE '%NIK%' OR COLUMN_NAME LIKE '%KTP%' OR COLUMN_NAME LIKE '%IDENT%'
      ORDER BY TABLE_NAME, COLUMN_NAME
    `);
    console.log(JSON.stringify(schema, null, 2));
  } catch (e) {
    console.log('Error:', (e as Error).message);
  }

  console.log('\n=== DB_PTRJ.HR_EMPLOYEE COLUMNS ===');
  try {
    const cols = await dbQuery(`
      SELECT COLUMN_NAME, DATA_TYPE
      FROM [DESKTOP-U5GUJPG].DB_PTRJ.INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'HR_EMPLOYEE'
      ORDER BY ORDINAL_POSITION
    `);
    console.log(JSON.stringify(cols, null, 2));
  } catch (e) {
    console.log('Error:', (e as Error).message);
  }

  console.log('\n=== DB_PTRJ.HR_EMPLOYEE SAMPLE ===');
  try {
    const sample = await dbQuery(`
      SELECT TOP 5 *
      FROM [DESKTOP-U5GUJPG].DB_PTRJ.dbo.HR_EMPLOYEE
    `);
    console.log('Columns:', Object.keys(sample[0] || {}).join(', '));
    console.log(JSON.stringify(sample, null, 2));
  } catch (e) {
    console.log('Error:', (e as Error).message);
  }

  // Look for NIK in other tables
  console.log('\n=== DB_PTRJ - ALL TABLES WITH NIK-RELATED COLUMNS ===');
  try {
    const tables = await dbQuery(`
      SELECT TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, DATA_TYPE
      FROM [DESKTOP-U5GUJPG].DB_PTRJ.INFORMATION_SCHEMA.COLUMNS
      WHERE COLUMN_NAME LIKE '%NIK%' OR COLUMN_NAME LIKE '%KTP%'
      ORDER BY TABLE_NAME, COLUMN_NAME
    `);
    console.log(JSON.stringify(tables, null, 2));
  } catch (e) {
    console.log('Error:', (e as Error).message);
  }
}

auditDbPtrj().then(() => process.exit(0));
