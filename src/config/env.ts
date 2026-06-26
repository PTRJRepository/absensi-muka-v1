import * as dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  APP_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_PORT: z.coerce.number().int().positive().default(3000),
  DB_SERVER: z.string().min(1),
  DB_PORT: z.coerce.number().int().positive().default(1433),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string().min(1),
  DB_NAME: z.string().min(1).default('rebinmas_absensi_monitoring'),
  DB_ENCRYPT: z.coerce.boolean().default(false),
  DB_TRUST_SERVER_CERTIFICATE: z.coerce.boolean().default(true),
  JWT_SECRET: z.string().min(8),
  JWT_EXPIRES_IN: z.string().default('1d'),
  SYNC_INTERVAL_MINUTES: z.coerce.number().int().positive().default(15),
  ZKTECO_PASSWORD: z.string().optional(),
  ZKTECO_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
});

export type Env = z.infer<typeof envSchema>;

export const env = envSchema.parse({
  APP_ENV: process.env.APP_ENV,
  APP_PORT: process.env.APP_PORT,
  DB_SERVER: process.env.DB_SERVER,
  DB_PORT: process.env.DB_PORT,
  DB_USER: process.env.DB_USER,
  DB_PASSWORD: process.env.DB_PASSWORD,
  DB_NAME: process.env.DB_NAME,
  DB_ENCRYPT: process.env.DB_ENCRYPT === 'true',
  DB_TRUST_SERVER_CERTIFICATE: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true',
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN,
  SYNC_INTERVAL_MINUTES: process.env.SYNC_INTERVAL_MINUTES,
  ZKTECO_PASSWORD: process.env.ZKTECO_PASSWORD,
  ZKTECO_TIMEOUT_MS: process.env.ZKTECO_TIMEOUT_MS,
});

export function safeEnvSummary() {
  return {
    appEnv: env.APP_ENV,
    appPort: env.APP_PORT,
    dbServer: env.DB_SERVER,
    dbPort: env.DB_PORT,
    dbName: env.DB_NAME,
    dbEncrypt: env.DB_ENCRYPT,
    dbTrustServerCertificate: env.DB_TRUST_SERVER_CERTIFICATE,
    syncIntervalMinutes: env.SYNC_INTERVAL_MINUTES,
  };
}
