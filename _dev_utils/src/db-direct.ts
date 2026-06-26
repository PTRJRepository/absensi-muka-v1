/**
 * Direct SQL Server connection via mssql
 * Baca credentials dari .env (DATABASE_PROFILES_SERVER_PROFILE_1_*)
 */
import * as mssql from "mssql";
import { fileURLToPath } from "url";
import * as path from "path";
import * as dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from root project directory
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const env = process.env;

// Fallback jika .env tidak ter-load (untuk development)
const server     = env.DATABASE_PROFILES_SERVER_PROFILE_1_SERVER     || "10.0.0.110";
const port       = Number(env.DATABASE_PROFILES_SERVER_PROFILE_1_PORT) || 1433;
const user       = env.DATABASE_PROFILES_SERVER_PROFILE_1_USERNAME  || "sa";
const password   = env.DATABASE_PROFILES_SERVER_PROFILE_1_PASSWORD  || "<DB_PASSWORD>";
const encrypt    = env.DATABASE_PROFILES_SERVER_PROFILE_1_ENCRYPT    !== "false";

const config: mssql.config = {
  server,
  port,
  user,
  password,
  database: "extend_db_ptrj",
  options: {
    encrypt:                encrypt,
    trustServerCertificate: true,
    enableArithAbort:       true,
  },
  pool: {
    max:              10,
    min:              0,
    idleTimeoutMillis: 30000,
  },
};

let pool: mssql.ConnectionPool | null = null;

export async function getPool(): Promise<mssql.ConnectionPool> {
  if (pool && pool.connected) return pool;
  pool = await mssql.connect(config);
  return pool;
}

export async function query<T = any>(sql: string, params?: Record<string, any>): Promise<T[]> {
  const p = await getPool();
  const req = p.request();
  if (params) {
    for (const [key, val] of Object.entries(params)) {
      req.input(key, val);
    }
  }
  const result = await req.query(sql);
  return result.recordset as T[];
}

export async function execute(sql: string, params?: Record<string, any>): Promise<number> {
  const p = await getPool();
  const req = p.request();
  if (params) {
    for (const [key, val] of Object.entries(params)) {
      req.input(key, val);
    }
  }
  const result = await req.query(sql);
  return result.rowsAffected[0] ?? 0;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.close();
    pool = null;
  }
}
