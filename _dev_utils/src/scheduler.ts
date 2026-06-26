import { config } from "./config.ts";
import { runSync } from "./sync.ts";

/**
 * Scheduler untuk auto sync data absensi
 * Menggunakan node-cron untuk menjadwalkan sync
 */

// Parse interval dari config
const intervalMinutes = config.sync.intervalMinutes || 15;
const intervalCron = `*/${intervalMinutes} * * * *`;

console.log(`
╔══════════════════════════════════════════════════════════════╗
║     Monitoring Absensi - Auto Sync Scheduler                ║
╠══════════════════════════════════════════════════════════════╣
║  Interval: every ${intervalMinutes} minutes                                      ║
║  Divisions: ${config.divisions.slice(0, 3).join(", ")}...                         ║
║  Modes: ${config.sync.modes.join(", ")}                                           ║
╚══════════════════════════════════════════════════════════════╝
`);

// Simple scheduler menggunakan setInterval
// Untuk production, bisa menggunakan node-cron

let isRunning = false;
let lastSyncTime: Date | null = null;

async function runScheduledSync() {
  if (isRunning) {
    console.log("⏳ Sync already running, skipping...");
    return;
  }

  isRunning = true;
  lastSyncTime = new Date();

  console.log(`\n🕐 [${lastSyncTime.toISOString()}] Starting scheduled sync...`);

  try {
    // Sync untuk semua mode
    for (const mode of config.sync.modes) {
      console.log(`\n📊 Syncing mode: ${mode}`);
      await runSync({ mode: mode as "hk" | "ot" });
    }

    console.log(`\n✅ [${new Date().toISOString()}] Scheduled sync completed!`);
  } catch (error: any) {
    console.error(`\n❌ [${new Date().toISOString()}] Scheduled sync failed:`, error.message);
  } finally {
    isRunning = false;
  }
}

// Jalankan scheduler
console.log(`\n⏰ Scheduler started. Next sync in ${intervalMinutes} minutes...`);
console.log("Press Ctrl+C to stop\n");

// Initial sync
runScheduledSync();

// Schedule subsequent syncs
setInterval(runScheduledSync, intervalMinutes * 60 * 1000);
