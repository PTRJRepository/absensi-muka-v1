import * as dotenv from "dotenv";
import * as path from "path";
import { query, closePool } from "./db-direct";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function main() {
  // Seed mst_division
  const divisions = [
    { code: "PG1A", name: "Plantation 1A", loc_code: "A", machine_suffix: "P1A", scanner_code: 100 },
    { code: "PG1B", name: "Plantation 1B", loc_code: "B", machine_suffix: "P1B", scanner_code: 300 },
    { code: "PG2A", name: "Plantation 2A", loc_code: "C", machine_suffix: "P2A", scanner_code: 500 },
    { code: "PG2B", name: "Plantation 2B", loc_code: "D", machine_suffix: "P2B", scanner_code: 600 },
    { code: "DME", name: "DME Plantation", loc_code: "E", machine_suffix: "DME", scanner_code: 700 },
    { code: "ARA", name: "ARA Plantation", loc_code: "F", machine_suffix: "ARA", scanner_code: 800 },
    { code: "ARB1", name: "ARB Plantation 1", loc_code: "G", machine_suffix: "AB1", scanner_code: 900 },
    { code: "ARB2", name: "ARB Plantation 2", loc_code: "H", machine_suffix: "AB2", scanner_code: 400 },
    { code: "AREC", name: "Area Controller", loc_code: "J", machine_suffix: "ARC", scanner_code: 200 },
    { code: "IJL", name: "IJL Plantation", loc_code: "L", machine_suffix: "IJL", scanner_code: null },
    { code: "INFRA", name: "Infrastructure", loc_code: "N", machine_suffix: null, scanner_code: null },
    { code: "SECURITY", name: "Security", loc_code: "S", machine_suffix: null, scanner_code: null },
    { code: "OFFICE", name: "Office / Staff", loc_code: "O", machine_suffix: null, scanner_code: null },
  ];

  console.log("Seeding mst_division...");
  for (const d of divisions) {
    await query(`
      INSERT INTO mst_division (division_code, division_name, loc_code, machine_suffix, scanner_code, is_active, created_at)
      VALUES (${q(d.code)}, ${q(d.name)}, ${q(d.loc_code)}, ${q(d.machine_suffix)}, ${d.scanner_code ?? 'NULL'}, 1, GETDATE())
    `);
    console.log(`  ✓ ${d.code} - ${d.name}`);
  }

  // Seed attendance_holiday (Nasional holidays 2026)
  const holidays = [
    { date: "2026-01-01", name: "Tahun Baru 2026", is_national: 1 },
    { date: "2026-01-29", name: "Isra Mikraj", is_national: 1 },
    { date: "2026-02-16", name: "Imlek", is_national: 1 },
    { date: "2026-03-03", name: "Hari Raya Nyepi", is_national: 1 },
    { date: "2026-03-20", name: "Jumat Agung", is_national: 1 },
    { date: "2026-03-31", name: "Idul Fitri 1437 H", is_national: 1 },
    { date: "2026-04-01", name: "Idul Fitri 1437 H (Libur)", is_national: 1 },
    { date: "2026-04-09", name: "Wafat Yesus Kristus", is_national: 1 },
    { date: "2026-04-23", name: "Hari Kartini", is_national: 1 },
    { date: "2026-05-01", name: "Hari Buruh Internasional", is_national: 1 },
    { date: "2026-05-12", name: "Idul Adha 1447 H", is_national: 1 },
    { date: "2026-05-26", name: "Kenaikan Isa Al-Masih", is_national: 1 },
    { date: "2026-06-01", name: "Hari Lahir Pancasila", is_national: 1 },
    { date: "2026-06-19", name: "1 Muharram 1448 H", is_national: 1 },
    { date: "2026-08-17", name: "Hari Ulang Tahun Kemerdekaan RI", is_national: 1 },
    { date: "2026-09-06", name: "Maulid Nabi Muhammad SAW", is_national: 1 },
    { date: "2026-10-05", name: "Hari Kesaktian Pancasila", is_national: 1 },
    { date: "2026-12-25", name: "Natal", is_national: 1 },
  ];

  console.log("\nSeeding attendance_holiday...");
  for (const h of holidays) {
    await query(`
      INSERT INTO attendance_holiday (holiday_date, holiday_name, is_national, created_at)
      VALUES (${q(h.date)}, ${q(h.name)}, ${h.is_national}, GETDATE())
    `);
    console.log(`  ✓ ${h.date} - ${h.name}`);
  }

  const divCount = await query("SELECT COUNT(*) as cnt FROM mst_division");
  const holCount = await query("SELECT COUNT(*) as cnt FROM attendance_holiday");
  console.log(`\nDone. mst_division: ${divCount[0].cnt} rows, attendance_holiday: ${holCount[0].cnt} rows`);

  await closePool();
}

function q(v: string | null) {
  return v === null ? "NULL" : `'${v}'`;
}

main().catch(console.error);