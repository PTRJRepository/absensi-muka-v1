import sql from 'mssql';
import { env } from '../config/env';

let pool: sql.ConnectionPool | null = null;

const sqlConfig: sql.config = {
  server: env.DB_SERVER,
  port: env.DB_PORT,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  requestTimeout: 60000,
  options: {
    encrypt: env.DB_ENCRYPT,
    trustServerCertificate: env.DB_TRUST_SERVER_CERTIFICATE,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

export type SqlParamType = any;

export interface SqlParam {
  name: string;
  type: SqlParamType;
  value: unknown;
}

function bindParams(request: sql.Request, params: SqlParam[] = []) {
  for (const param of params) request.input(param.name, param.type as never, param.value);
  return request;
}

export async function getDbPool() {
  if (pool?.connected) return pool;
  pool = new sql.ConnectionPool(sqlConfig);
  pool.on('error', (error) => console.error('SQL pool error', { message: error.message }));
  return pool.connect();
}

export async function closeDbPool() {
  if (!pool) return;
  await pool.close();
  pool = null;
}

export async function query<T>(statement: string, params: SqlParam[] = []): Promise<T[]> {
  const dbPool = await getDbPool();
  const request = bindParams(dbPool.request(), params);
  const result = await request.query<T>(statement);
  return result.recordset ?? [];
}

export async function execute(statement: string, params: SqlParam[] = []) {
  const dbPool = await getDbPool();
  const request = bindParams(dbPool.request(), params);
  return request.query(statement);
}

export async function withTransaction<T>(handler: (transaction: sql.Transaction) => Promise<T>): Promise<T> {
  const dbPool = await getDbPool();
  const transaction = new sql.Transaction(dbPool);
  await transaction.begin();
  try {
    const result = await handler(transaction);
    await transaction.commit();
    return result;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function checkDbConnection() {
  const rows = await query<{ ok: number; db_name: string }>('SELECT 1 AS ok, DB_NAME() AS db_name');
  return { connected: rows[0]?.ok === 1, database: rows[0]?.db_name ?? env.DB_NAME };
}

export { sql };
