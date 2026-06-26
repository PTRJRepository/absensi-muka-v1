/**
 * Database Analysis - Additional Stats
 */

import sql from 'mssql';
import { env } from '../src/config/env';

const sqlConfig: sql.config = {
  server: env.DB_SERVER,
  port: env.DB_PORT,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: 'rebinmas_absensi_monitoring',
  options: { encrypt: env.DB_ENCRYPT, trustServerCertificate: env.DB_TRUST_SERVER_CERTIFICATE },
};

async function q<T>(pool: sql.ConnectionPool, statement: string): Promise<T[]> {
  const result = await pool.request().query(statement);
  return result.recordset as T[];
}

async function main() {
  const pool = new sql.ConnectionPool(sqlConfig);
  await pool.connect();

  console.log('\n=== ZKTECO_ABSENSI_USER_MACHINE ===');
  const um = await q<any>(pool, `SELECT COUNT(*) as cnt, COUNT(DISTINCT raw_device_user_id) as unique_ids, COUNT(DISTINCT machine_code) as machines FROM zkteco_absensi_user_machine`);
  console.log('Total:', um[0].cnt, '| Unique raw IDs:', um[0].unique_ids, '| Machines:', um[0].machines);

  const umPrefix = await q<any>(pool, `SELECT LEFT(raw_device_user_id,3) as prefix, COUNT(*) as cnt FROM zkteco_absensi_user_machine WHERE LEN(raw_device_user_id) > 5 GROUP BY LEFT(raw_device_user_id,3) ORDER BY prefix`);
  console.log('\nBy scanner prefix (long IDs):');
  umPrefix.forEach((r: any) => console.log('  ' + r.prefix + ': ' + r.cnt));

  console.log('\n=== ZKTECO_ABSENSI_USER_REGISTRY ===');
  const reg = await q<any>(pool, `SELECT COUNT(*) as cnt, COUNT(DISTINCT parsed_employee_code) as unique_parsed, SUM(scan_count) as total_scans FROM zkteco_absensi_user_registry`);
  console.log('Total:', reg[0].cnt, '| Unique parsed codes:', reg[0].unique_parsed, '| Total scans:', reg[0].total_scans);

  const regCat = await q<any>(pool, `SELECT id_category, COUNT(*) as cnt FROM zkteco_absensi_user_registry GROUP BY id_category`);
  console.log('\nBy ID category:');
  regCat.forEach((r: any) => console.log('  ' + r.id_category + ': ' + r.cnt));

  const regPrefix = await q<any>(pool, `SELECT scanner_prefix, COUNT(*) as cnt, SUM(scan_count) as scans FROM zkteco_absensi_user_registry WHERE scanner_prefix IS NOT NULL GROUP BY scanner_prefix ORDER BY scanner_prefix`);
  console.log('\nBy scanner prefix:');
  regPrefix.forEach((r: any) => console.log('  ' + r.scanner_prefix + ': ' + r.cnt + ' users, ' + r.scans + ' scans'));

  console.log('\n=== CROSS-MACHINE EMPLOYEES ===');
  const cross = await q<any>(pool, `SELECT TOP 10 raw_device_user_id, COUNT(DISTINCT machine_code) as machine_cnt, STRING_AGG(machine_code, ', ') as machines FROM zkteco_absensi_user_machine GROUP BY raw_device_user_id HAVING COUNT(DISTINCT machine_code) > 1 ORDER BY machine_cnt DESC`);
  console.log('Raw device users in multiple machines:');
  cross.forEach((r: any) => console.log('  ' + r.raw_device_user_id + ': ' + r.machine_cnt + ' machines [' + r.machines + ']'));

  console.log('\n=== MAPPING QUALITY ===');
  const mappingQuality = await q<any>(pool, `
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN hr_employee_code IS NOT NULL THEN 1 ELSE 0 END) as has_hr_code,
      SUM(CASE WHEN hr_employee_code IS NULL THEN 1 ELSE 0 END) as no_hr_code
    FROM zkteco_absensi_user_registry
  `);
  console.log('zkteco_absensi_user_registry:');
  console.log('  Total:', mappingQuality[0].total);
  console.log('  Has HR employee code:', mappingQuality[0].has_hr_code);
  console.log('  No HR employee code:', mappingQuality[0].no_hr_code);

  await pool.close();
}

main().catch(console.error);
