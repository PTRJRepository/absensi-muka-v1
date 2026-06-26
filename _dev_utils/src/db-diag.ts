/**
 * Diagnostic script - test direct connection and env loading
 */
import * as dotenv from "dotenv";
import * as path from "path";
import * as mssql from "mssql";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

console.log("=== ENV DIAGNOSTIC ===");
console.log("SERVER:", process.env.DATABASE_PROFILES_SERVER_PROFILE_1_SERVER);
console.log("PORT:", process.env.DATABASE_PROFILES_SERVER_PROFILE_1_PORT);
console.log("USER:", process.env.DATABASE_PROFILES_SERVER_PROFILE_1_USERNAME);
console.log("PASSWORD:", process.env.DATABASE_PROFILES_SERVER_PROFILE_1_PASSWORD ? "***" : "MISSING");

const cfg: mssql.config = {
  server:   process.env.DATABASE_PROFILES_SERVER_PROFILE_1_SERVER || "10.0.0.110",
  port:     Number(process.env.DATABASE_PROFILES_SERVER_PROFILE_1_PORT) || 1433,
  user:     process.env.DATABASE_PROFILES_SERVER_PROFILE_1_USERNAME || "sa",
  password: process.env.DATABASE_PROFILES_SERVER_PROFILE_1_PASSWORD || "<DB_PASSWORD>",
  database: "extend_db_ptrj",
  options: {
    encrypt: false,
    trustServerCertificate: true,
    enableArithAbort: true,
  },
};

console.log("\n=== MSSQL CONFIG ===");
console.log("server:", cfg.server, typeof cfg.server);
console.log("port:", cfg.port, typeof cfg.port);
console.log("user:", cfg.user);
console.log("database:", cfg.database);

console.log("\n=== TESTING CONNECTION ===");
const pool = new mssql.ConnectionPool(cfg);
pool.connect()
  .then(() => {
    console.log("✓ Connected!");
    return pool.query("SELECT GETDATE() AS now");
  })
  .then(r => {
    console.log("✓ Query OK:", r.recordset[0].now);
    pool.close();
    process.exit(0);
  })
  .catch(err => {
    console.error("✗ Error:", err.message);
    pool.close();
    process.exit(1);
  });