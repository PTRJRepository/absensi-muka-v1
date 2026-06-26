/**
 * Seed Master Data - divisi, mesin, karyawan
 * Run: npx tsx seed-master-data.ts
 */
import { query } from "./db-direct.ts";

async function insertDivision(code: string, name: string, locCode: string, isApi: boolean = false) {
  const sql = `INSERT INTO mst_division (division_code, division_name, loc_code, is_api_source, is_active)
    VALUES ('${code}', N'${name}', '${locCode}', ${isApi}, 1)`;
  try {
    await query(sql);
    console.log(`  ✓ ${code}: ${name}`);
  } catch(e: any) {
    if (e.message?.includes("duplicate")) console.log(`  · ${code}: already exists`);
    else console.log(`  ✗ ${code}: ${e.message}`);
  }
}

async function insertMachine(
  code: string, name: string, ip: string, port: number,
  locCode: string, divId: number, machineId: number
) {
  const sql = `INSERT INTO mst_machine (machine_id, machine_code, machine_name, ip_address, port, loc_code, division_id, zk_password, is_active)
    VALUES (${machineId}, '${code}', N'${name}', '${ip}', ${port}, '${locCode}', ${divId}, '12345', 1)`;
  try {
    await query(sql);
    console.log(`  ✓ ${code} (${ip}:${port}) → loc=${locCode}, divId=${divId}`);
  } catch(e: any) {
    if (e.message?.includes("duplicate")) console.log(`  · ${code}: already exists`);
    else console.log(`  ✗ ${code}: ${e.message}`);
  }
}

async function seedDivisions() {
  console.log("\n[1] Seeding mst_division...");
  const divisions = [
    { code: "PGE",  name: "Pl摘 Glebang Estate",     loc: "A", isApi: false },
    { code: "P1A", name: "Plantation 1A",           loc: "A", isApi: true  },
    { code: "ARC", name: "Ar Rancabulu Estate",      loc: "J", isApi: false },
    { code: "AREC", name: "Area C Estate",           loc: "J", isApi: true  },
    { code: "P1B", name: "Plantation 1B",            loc: "B", isApi: true  },
    { code: "AB2", name: "Arboretum 2 Estate",       loc: "H", isApi: false },
    { code: "ARB2", name: "Arboretum 2 Estate",     loc: "H", isApi: true  },
    { code: "P2A", name: "Plantation 2A",           loc: "C", isApi: true  },
    { code: "P2B", name: "Plantation 2B",           loc: "D", isApi: true  },
    { code: "DME", name: "Dwikarya Estate",         loc: "E", isApi: false },
    { code: "ARA", name: "Arara Estate",           loc: "F", isApi: false },
    { code: "AB1", name: "Arboretum 1 Estate",     loc: "G", isApi: false },
    { code: "ARB1", name: "Arboretum 1 Estate",     loc: "G", isApi: true  },
    { code: "IJL", name: "Injury Light Estate",     loc: "L", isApi: true  },
    { code: "STF", name: "Staff / Office",          loc: "X", isApi: true  },
    { code: "SEC", name: "Security",                loc: "X", isApi: true  },
  ];
  for (const d of divisions) await insertDivision(d.code, d.name, d.loc, d.isApi);
}

async function seedMachines() {
  console.log("\n[2] Seeding mst_machine...");
  const machines = [
    { code: "PGE",   name: "PGE Machine",      ip: "10.0.0.232",   port: 4370, loc: "A", divId: 1,  mid: 1  },
    { code: "MILL",  name: "Mill Machine",      ip: "103.127.66.32", port: 4370, loc: "A", divId: 1,  mid: 2  },
    { code: "DME_01", name: "DME Machine 01",   ip: "103.144.228.42", port: 4700, loc: "E", divId: 10, mid: 3  },
    { code: "DME_02", name: "DME Machine 02",   ip: "103.144.228.42", port: 4701, loc: "E", divId: 10, mid: 4  },
    { code: "DME_03", name: "DME Machine 03",   ip: "103.144.228.42", port: 4702, loc: "E", divId: 10, mid: 5  },
    { code: "DME_04", name: "DME Machine 04",   ip: "103.144.228.42", port: 4703, loc: "E", divId: 10, mid: 6  },
    { code: "ARA",   name: "ARA Machine",       ip: "103.144.208.154", port: 4800, loc: "F", divId: 11, mid: 7  },
    { code: "ARE",   name: "ARE Machine",       ip: "103.144.208.154", port: 4370, loc: "J", divId: 4,  mid: 8  },
    { code: "IJL",   name: "IJL Machine",       ip: "103.144.211.226", port: 4370, loc: "L", divId: 14, mid: 9  },
    { code: "AB2",   name: "AB2 Machine",       ip: "103.144.208.154", port: 4900, loc: "H", divId: 6,  mid: 10 },
    // AB1 & ARC via API only (no direct machine)
  ];
  for (const m of machines) await insertMachine(m.code, m.name, m.ip, m.port, m.loc, m.divId, m.mid);
}

async function main() {
  console.log("=== SEED MASTER DATA ===");
  await seedDivisions();
  await seedMachines();

  // Show result
  console.log("\n[3] Verification...");
  const div: any = await query("SELECT COUNT(*) as cnt FROM mst_division");
  const mach: any = await query("SELECT COUNT(*) as cnt FROM mst_machine");
  console.log(`mst_division: ${div?.[0]?.cnt ?? '?'} rows`);
  console.log(`mst_machine: ${mach?.[0]?.cnt ?? '?'} rows`);
  console.log("\nDone.");
}

main().catch(console.error);