import mssql from "mssql";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, ".env") });

const env = process.env;
const pool = await mssql.connect({
  server: env.DATABASE_PROFILES_SERVER_PROFILE_1_SERVER,
  port: Number(env.DATABASE_PROFILES_SERVER_PROFILE_1_PORT) || 1433,
  user: env.DATABASE_PROFILES_SERVER_PROFILE_1_USERNAME,
  password: env.DATABASE_PROFILES_SERVER_PROFILE_1_PASSWORD,
  database: "db_faceattn_ptrj",
  options: { encrypt: false, trustServerCertificate: true },
});

async function q(sql) { return (await pool.request().query(sql)).recordset; }

const tables = [
  'attendance_scan_log',
  'attendance_sorting_result',
  'employee_attendance_daily',
  'attendance_manual_input'
];

for (const t of tables) {
  try {
    const cols = await q(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='${t}' ORDER BY ORDINAL_POSITION`);
    console.log('\n=== ' + t + ' ===');
    cols.forEach(c => console.log('  ' + c.COLUMN_NAME));
  } catch (e) {
    console.log('\n=== ' + t + ' === ERROR: ' + e.message);
  }
}

await pool.close();