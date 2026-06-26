import { config } from "./config.ts";
import { sqlClient } from "./sql-client.ts";
import { absensiApi } from "./absensi-client.ts";
import { createTables, initConfig } from "./database.ts";

/**
 * Sync Data Absensi dari IT Solution ke Database
 */

interface SyncOptions {
  division?: string;
  year?: number;
  month?: number;
  mode?: "hk" | "ot";
}

/**
 * Sync data absensi untuk satu divisi
 */
async function syncDivision(
  division: string,
  year: number,
  month: number,
  mode: "hk" | "ot" = "hk"
): Promise<number> {
  console.log(`\n📥 Syncing: ${division} - ${month}/${year} (mode: ${mode})`);

  const startTime = Date.now();

  try {
    // Ambil data dari API
    const attendanceData = await absensiApi.getAttendance(division, month, year, mode);

    if (!attendanceData || attendanceData.length === 0) {
      console.log(`  ⚠️ No data for ${division}`);
      return 0;
    }

    let syncedCount = 0;

    // Proses setiap employee
    for (const row of attendanceData) {
      const empCode = row.empCode;
      const empName = row.empName;
      const gangCode = row.gangCode;

      // Proses setiap hari dalam sebulan
      for (let day = 1; day <= 31; day++) {
        const dayData = row[`day_${day}`];

        if (!dayData) continue;

        // Parse tanggal
        const date = new Date(year, month - 1, day);
        const attendanceDate = date.toISOString().split("T")[0];

        // Skip jika hari dalam bulan tidak valid
        if (date.getMonth() !== month - 1) continue;

        // Build values untuk insert/update
        const values = {
          emp_code: empCode,
          emp_name: empName,
          gang_code: gangCode,
          division: division,
          year: year,
          month: month,
          day: day,
          has_work: dayData.hasWork ? 1 : 0,
          is_sunday: dayData.isSunday ? 1 : 0,
          is_holiday: dayData.isHoliday ? 1 : 0,
          holiday_desc: dayData.holidayDesc || null,
          is_cuti: dayData.isCuti ? 1 : 0,
          is_sakit: dayData.isSakit ? 1 : 0,
          task_code: dayData.taskCode || null,
          ot_hours: dayData.otHours || 0,
          attendance_date: attendanceDate,
        };

        // Insert atau Update (upsert)
        const sql = `
          MERGE INTO absen_master AS target
          USING (SELECT
            '${values.emp_code}' AS emp_code,
            '${values.division}' AS division,
            ${values.year} AS year,
            ${values.month} AS month,
            ${values.day} AS day
          ) AS source
          ON target.emp_code = source.emp_code
            AND target.division = source.division
            AND target.year = source.year
            AND target.month = source.month
            AND target.day = source.day
          WHEN MATCHED THEN
            UPDATE SET
              emp_name = '${values.emp_name}',
              gang_code = '${values.gang_code}',
              has_work = ${values.has_work},
              is_sunday = ${values.is_sunday},
              is_holiday = ${values.is_holiday},
              holiday_desc = ${values.holiday_desc ? `'${values.holiday_desc}'` : 'NULL'},
              is_cuti = ${values.is_cuti},
              is_sakit = ${values.is_sakit},
              task_code = ${values.task_code ? `'${values.task_code}'` : 'NULL'},
              ot_hours = ${values.ot_hours},
              updated_at = GETDATE()
          WHEN NOT MATCHED THEN
            INSERT (emp_code, emp_name, gang_code, division, year, month, day,
                    has_work, is_sunday, is_holiday, holiday_desc, is_cuti, is_sakit,
                    task_code, ot_hours, attendance_date)
            VALUES ('${values.emp_code}', '${values.emp_name}', '${values.gang_code}',
                    '${values.division}', ${values.year}, ${values.month}, ${values.day},
                    ${values.has_work}, ${values.is_sunday}, ${values.is_holiday},
                    ${values.holiday_desc}, ${values.is_cuti}, ${values.is_sakit},
                    ${values.task_code}, ${values.ot_hours}, '${values.attendance_date}');
        `;

        try {
          await sqlClient.execute(sql);
          syncedCount++;
        } catch (e) {
          console.error(`  ❌ Error syncing ${empCode} day ${day}:`, e.message);
        }
      }
    }

    // Log sync
    const duration = Date.now() - startTime;
    await logSync(division, year, month, mode, syncedCount, "SUCCESS", null, duration);

    console.log(`  ✅ Synced ${syncedCount} records in ${duration}ms`);
    return syncedCount;

  } catch (error: any) {
    const duration = Date.now() - startTime;
    await logSync(division, year, month, mode, 0, "FAILED", error.message, duration);
    console.error(`  ❌ Sync failed:`, error.message);
    throw error;
  }
}

/**
 * Log sync ke database
 */
async function logSync(
  division: string | null,
  year: number | null,
  month: number | null,
  mode: string | null,
  recordsSynced: number,
  status: string,
  errorMessage: string | null,
  durationMs: number
): Promise<void> {
  const sql = `
    INSERT INTO absen_sync_log (division, year, month, mode, records_synced, status, error_message, duration_ms)
    VALUES (${division ? `'${division}'` : 'NULL'},
            ${year || 'NULL'},
            ${month || 'NULL'},
            ${mode ? `'${mode}'` : 'NULL'},
            ${recordsSynced},
            '${status}',
            ${errorMessage ? `'${errorMessage.replace(/'/g, "''")}'` : 'NULL'},
            ${durationMs})
  `;

  await sqlClient.execute(sql);
}

/**
 * Main sync function
 */
export async function runSync(options: SyncOptions = {}): Promise<void> {
  console.log("=".repeat(50));
  console.log("🚀 Starting Absensi Sync");
  console.log("=".repeat(50));

  const startTime = Date.now();

  try {
    // Initialize tables
    await createTables();
    await initConfig();

    const divisions = options.division ? [options.division] : config.divisions;
    const mode = options.mode || "hk";

    let totalSynced = 0;

    for (const division of divisions) {
      try {
        // Ambil bulan yang tersedia
        const months = await absensiApi.getAvailableMonths(division);

        if (months.length === 0) {
          console.log(`⚠️ No data available for ${division}`);
          continue;
        }

        // Jika tidak specify year/month, sync semua bulan yang tersedia
        const targetMonths = options.year && options.month
          ? [{ year: options.year, month: options.month }]
          : months;

        for (const { year, month } of targetMonths) {
          const count = await syncDivision(division, year, month, mode);
          totalSynced += count;
        }
      } catch (e: any) {
        console.error(`❌ Error syncing division ${division}:`, e.message);
      }
    }

    const totalTime = Date.now() - startTime;
    console.log("\n" + "=".repeat(50));
    console.log(`✅ Sync completed! Total: ${totalSynced} records in ${totalTime}ms`);
    console.log("=".repeat(50));

  } catch (error: any) {
    console.error("\n❌ Sync failed:", error.message);
    throw error;
  }
}

// Run if called directly
if (import.meta.main) {
  runSync().catch(console.error);
}
