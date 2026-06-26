import { config } from "./config.ts";
import { absensiApi } from "./absensi-client.ts";

const API_KEY = config.sqlGateway.apiKey;
const BASE_URL = config.sqlGateway.baseUrl;

async function query(sql: string) {
  const response = await fetch(BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
    },
    body: JSON.stringify({
      sql,
      db: config.sqlGateway.database,
      server: config.sqlGateway.server,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`HTTP ${response.status}: ${error}`);
  }

  const result = await response.json();
  if (!result.success) {
    throw new Error(result.error || "Query failed");
  }
  return result.data;
}

async function importData() {
  console.log("Getting attendance data from API...");

  const data = await absensiApi.getAttendance("PG1A", 3, 2026, "hk");
  console.log(`Got ${data.length} employees`);

  const batchId = `batch-${Date.now()}`;

  // Insert batch header
  await query(`
    INSERT INTO absen_import_batch (batch_id, division, year, month, total_records, status, imported_by)
    VALUES ('${batchId}', 'PG1A', 2026, 3, ${data.length}, 'IN_PROGRESS', 'API')
  `);
  console.log("✅ Batch header created");

  let inserted = 0;

  // Process each employee
  for (let i = 0; i < data.length; i++) {
    const emp = data[i];
    const empCode = emp.empCode;

    // Process each day
    for (let day = 1; day <= 31; day++) {
      const dayKey = `day_${day}`;
      const dayData = emp[dayKey];

      if (!dayData) continue;

      const date = new Date(2026, 2, day); // March = 2 (0-indexed)
      if (date.getMonth() !== 2) continue;

      const sql = `
        INSERT INTO absen_import (
          emp_code, emp_name, gang_code, division, year, month, day,
          has_work, is_sunday, is_holiday, is_cuti, is_sakit,
          ot_hours, attendance_date, import_batch_id, source
        ) VALUES (
          '${empCode}',
          ${emp.empName ? `'${emp.empName.replace(/'/g, "''")}'` : 'NULL'},
          ${emp.gangCode ? `'${emp.gangCode}'` : 'NULL'},
          'PG1A', 2026, 3, ${day},
          ${dayData.hasWork ? 1 : 0},
          ${dayData.isSunday ? 1 : 0},
          ${dayData.isHoliday ? 1 : 0},
          ${dayData.isCuti ? 1 : 0},
          ${dayData.isSakit ? 1 : 0},
          ${parseFloat(dayData.otHours) || 0},
          '${date.toISOString().split('T')[0]}',
          '${batchId}',
          'MACHINE'
        )
      `;

      try {
        await query(sql);
        inserted++;

        // Small delay every 10 records to avoid rate limiting
        if (inserted % 10 === 0) {
          await new Promise(r => setTimeout(r, 100));
        }
      } catch (e: any) {
        console.log(`  ⚠️ Error inserting ${empCode} day ${day}: ${e.message}`);
      }
    }

    if ((i + 1) % 5 === 0) {
      console.log(`  Progress: ${i + 1}/${data.length} employees`);
    }
  }

  console.log(`\n✅ Inserted ${inserted} records`);
}

importData().catch(console.error);
