import { createTables, initConfig } from "./database.ts";

console.log("Creating tables in extend_db_ptrj...");

await createTables();
await initConfig();

console.log("✅ Database initialized!");
