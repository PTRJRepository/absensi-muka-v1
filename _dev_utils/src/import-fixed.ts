import { config } from "./config.ts";
import { absensiApi } from "./absensi-client.ts";

const API_KEY = config.sqlGateway.apiKey;
const BASE_URL = config.sqlGateway.baseUrl;
const SERVER = config.sqlGateway.server;
const DATABASE = config.sqlGateway.database;

async function query(sql: string) {
  const response = await fetch(BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
    },
    body: JSON.stringify({
      sql,
      server: SERVER,
      db: DATABASE,
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }

  const result = await response.json();
  if (!result.success) {
    throw new Error(result.error || "Query failed");
  }
  return result.data;
}

interface SyncOptions {
  division?: string;
  year?: number;
  month?: number;
  mode?: "hk" | "ot";
}

function parseAttendanceData(
  apiData: any[],
  division: string,
  year: number,
  month: number
): any[] {
  const records: any[] = [];

  for (const row of apiData) {
    const empCode = row.empCode;
    const empName = row.empName;
    const gangCode = row.gangCode;

    for (let day = 1; day <= 31; day++) {
      const dayKey = `day_${day}`;
      const dayData = row[dayKey];

      if (!dayData) continue;

      const date = new Date(year, month - 1, day);
      if (date.getMonth() !== month - 1) continue;

      records.push({
        emp_code: empCode,
        emp_name: empName || null,
        gang_code: gangCode || null,
        division: division,
        year: year,
        month: month,
        day: day,
        has_work: dayData.hasWork || false,
        is_sunday: dayData.isSunday || false,
        is_holiday: dayData.isHoliday || false,
        holiday_desc: dayData.holidayDesc || null,
        is_cuti: dayData.isCuti || false,
        is_sakit: dayData.isSakit || false,
        task_code: dayData.taskCode || null,
        ot_hours: parseFloat(dayData.otHours) || 0,
        attendance_date: date.toISOString().split("T")[0],
      });
    }
  }

  return records;
}

async function syncDivision(
  division: string,
  year: number,
  month: number,
  mode: "hk" | "ot" = "hk"
): Promise<number> {
  console.log(`\n📥 Syncing: ${division} - ${month}/${year} (mode: ${mode})`);

  const startTime = Date.now();

  try {
    const apiData = await absensiApi.getAttendance(division, month, year, mode);

    if (!apiData || apiData.length === 0) {
      console.log(`  ⚠️ No data from API for ${division}`);
      return 0;
    }

    const records = parseAttendanceData(apiData, division, year, month);
    console.log(`  📊 Parsed ${records.length} records`);

    const batchId = `batch-${Date.now()}`;

    // Insert batch header
    await query(`
      INSERT INTO absen_import_batch (batch_id, division, year, month, total_records, status, imported_by)
      VALUES ('${batchId}', '${division}', ${year}, ${month}, ${records.length}, 'IN_PROGRESS', 'API')
    `);

    let inserted = 0;
    const errors: string[] = [];

    // Insert each record with delay to avoid rate limiting
    for (let i = 0; i < records.length; i++) {
      const r = records[i];

      const sql = `
        INSERT INTO absen_import (
          emp_code, emp_name, gang_code, division, year, month, day,
          has_work, is_sunday, is_holiday, is_cuti, is_sakit,
          ot_hours, attendance_date, import_batch_id, source
        ) VALUES (
          '${r.emp_code}',
          ${r.emp_name ? `'${r.emp_name.replace(/'/g, "''")}'` : 'NULL'},
          ${r.gang_code ? `'${r.gang_code}'` : 'NULL'},
          '${r.division}',
          ${r.year},
          ${r.month},
          ${r.day},
          ${r.has_work ? 1 : 0},
          ${r.is_sunday ? 1 : 0},
          ${r.is_holiday ? 1 : 0},
          ${r.is_cuti ? 1 : 0},
          ${r.is_sakit ? 1 : 0},
          ${r.ot_hours},
          '${r.attendance_date}',
          '${batchId}',
          'MACHINE'
        )
      `;

      try {
        await query(sql);
        inserted++;

        // Small delay every 20 records
        if (i > 0 && i % 20 === 0) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      } catch (e: any) {
        errors.push(`${r.emp_code} day ${r.day}: ${e.message}`);
      }
    }

    // Update batch status
    await query(`
      UPDATE absen_import_batch
      SET status = '${errors.length > 0 ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED'}',
          imported_records = ${inserted},
          import_completed_at = GETDATE(),
          error_message = ${errors.length > 0 ? `'${errors.slice(0, 5).join("; ")}'` : 'NULL'}
      WHERE batch_id = '${batchId}'
    `);

    const duration = Date.now() - startTime;
    console.log(`  ✅ Imported ${inserted}/${records.length} records in ${duration}ms`);

    return inserted;
  } catch (error: any) {
    console.error(`  ❌ Sync failed:`, error.message);
    throw error;
  }
}

export async function runSync(options: SyncOptions = {}): Promise<void> {
  console.log("=".repeat(50));
  console.log("🚀 Starting Absensi Import (Fixed)");
  console.log("=".repeat(50));

  const startTime = Date.now();

  const divisions = options.division ? [options.division] : config.divisions;
  const mode = options.mode || "hk";

  let targetYear = options.year;
  let targetMonth = options.month;

  if (!targetYear || !targetMonth) {
    const firstDivision = divisions[0];
    const months = await absensiApi.getAvailableMonths(firstDivision);
    if (months.length > 0) {
      targetYear = months[0].year;
      targetMonth = months[0].month;
    }
  }

  if (!targetYear || !targetMonth) {
    throw new Error("Cannot determine target year/month");
  }

  console.log(`\n📅 Target: ${targetYear}-${String(targetMonth).padStart(2, "0")}`);
  console.log(`📂 Divisions: ${divisions.join(", ")}`);

  let totalImported = 0;

  for (const division of divisions) {
    try {
      const count = await syncDivision(division, targetYear, targetMonth, mode);
      totalImported += count;
    } catch (error: any) {
      console.error(`❌ Error syncing ${division}:`, error.message);
    }
  }

  const totalTime = Date.now() - startTime;
  console.log("\n" + "=".repeat(50));
  console.log(`✅ Import completed! Total: ${totalImported} records in ${totalTime}ms`);
  console.log("=".repeat(50));
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const options: SyncOptions = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--division" && args[i + 1]) options.division = args[i + 1];
    if (args[i] === "--year" && args[i + 1]) options.year = parseInt(args[i + 1]);
    if (args[i] === "--month" && args[i + 1]) options.month = parseInt(args[i + 1]);
    if (args[i] === "--mode" && args[i + 1]) options.mode = args[i + 1] as "hk" | "ot";
  }

  runSync(options).catch(console.error);
}
