// @ts-ignore - mssql package ships without local types in this repo
import mssql from 'mssql';
import fs from 'fs';

function loadEnv() {
  if (!fs.existsSync('.env')) return;
  for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
}

// Machine inventory source of truth - confirmed by operator config.
// access_status is the latest known probe result, data_source remains DIRECT_ZKTECO
// for all physical ZKTeco devices so sync can retry when network/firewall improves.
const machines = [
  ['OFFICE_PGE','Office PGE','223.25.98.220',4370,null,'ZKTECO',null,'A','ACCESSIBLE','DIRECT_ZKTECO','Operator source config: OFFICE_PGE 223.25.98.220:4370'],
  ['DME_01','DME 01','103.144.228.42',4700,null,'ZKTECO',700,'E','PORT_FORWARDING_NEEDED','DIRECT_ZKTECO','Operator source config: DME_01 103.144.228.42:4700'],
  ['OFFICE_APE','Office APE','103.144.208.154',4370,null,'ZKTECO',null,'F','ACCESSIBLE','DIRECT_ZKTECO','Operator source config: OFFICE_APE 103.144.208.154:4370'],
  ['MILL','Mill','103.127.66.32',4370,null,'ZKTECO',null,null,'ACCESSIBLE','DIRECT_ZKTECO','Operator source config: Mill 103.127.66.32:4370'],
  ['IJL','IJL','103.144.211.226',4370,null,'absensi',null,'L','ACCESSIBLE','DIRECT_ZKTECO','ZKTeco confirmed - 166 users, 4910 att'],
  ['ARC_01','ARC 01','103.144.208.154',4200,null,'ZKTECO',200,'J','PORT_FORWARDING_NEEDED','DIRECT_ZKTECO','Operator source config: ARC_01 103.144.208.154:4200'],
  ['DME_02','DME 02','103.144.228.42',4701,null,'ZKTECO',700,'E','PORT_FORWARDING_NEEDED','DIRECT_ZKTECO','Operator source config: DME_02 103.144.228.42:4701'],
  ['ARC_02','ARC 02','103.144.208.154',4201,null,'ZKTECO',200,'J','PORT_FORWARDING_NEEDED','DIRECT_ZKTECO','Operator source config: ARC_02 103.144.208.154:4201'],
  ['ARA','ARA','103.144.208.154',4800,null,'ZKTECO',800,'F','PORT_FORWARDING_NEEDED','DIRECT_ZKTECO','Operator source config: ARA 103.144.208.154:4800'],
  ['AB1','AB1','103.144.208.154',4900,null,'ZKTECO',900,'G','PORT_FORWARDING_NEEDED','DIRECT_ZKTECO','Operator source config: AB1 103.144.208.154:4900'],
  ['AB2','AB2','103.144.208.154',4400,'192.168.1.232','absensi',400,'H','ACCESSIBLE','DIRECT_ZKTECO','ZKTeco confirmed - 233 users, 3944 att'],
  ['P1A','P1A','10.0.0.90',4100,'10.0.0.90','absensi',100,'A','ACCESSIBLE','DIRECT_ZKTECO','ZKTeco confirmed - 792 users, 2681 att'],
  ['P1B','P1B','10.0.0.91',4300,'10.0.0.91','absensi',300,'B','ACCESSIBLE','DIRECT_ZKTECO','ZKTeco confirmed - 792 users, 2675 att'],
  ['P2A_01','P2A 01','10.0.0.92',4500,null,'ZKTECO',500,'C','NETWORK_UNREACHABLE','DIRECT_ZKTECO','Operator source config: P2A_01 10.0.0.92:4500'],
  ['P2B','P2B','10.0.0.93',4600,null,'ZKTECO',600,'D','NETWORK_UNREACHABLE','DIRECT_ZKTECO','Operator source config: P2B 10.0.0.93:4600'],
  ['P2A_02','P2A 02','10.0.0.94',4501,null,'ZKTECO',500,'C','NETWORK_UNREACHABLE','DIRECT_ZKTECO','Operator source config: P2A_02 10.0.0.94:4501'],
] as const;

function envValue(primary: string, fallback?: string, defaultValue?: string) {
  const clean = (value: string | undefined) => value?.trim().replace(/^['"]|['"]$/g, '');
  const primaryValue = clean(process.env[primary]);
  const fallbackValue = fallback ? clean(process.env[fallback]) : undefined;
  return primaryValue || fallbackValue || defaultValue;
}

function dbConfig(database?: string) {
  return {
    server: envValue('DB_SERVER', 'DATABASE_PROFILES_SERVER_PROFILE_1_SERVER', '10.0.0.110')!,
    port: Number(envValue('DB_PORT', 'DATABASE_PROFILES_SERVER_PROFILE_1_PORT', '1433')),
    user: envValue('DB_USER', 'DATABASE_PROFILES_SERVER_PROFILE_1_USERNAME')!,
    password: envValue('DB_PASSWORD', 'DATABASE_PROFILES_SERVER_PROFILE_1_PASSWORD')!,
    database: database ?? envValue('DB_NAME', undefined, 'rebinmas_absensi_monitoring'),
    options: { encrypt: envValue('DB_ENCRYPT', 'DATABASE_PROFILES_SERVER_PROFILE_1_ENCRYPT', 'false') === 'true', trustServerCertificate: envValue('DB_TRUST_SERVER_CERTIFICATE', undefined, 'true') !== 'false' },
  };
}

async function main() {
  loadEnv();
  const pool = await mssql.connect(dbConfig());

  const accessibleCount = machines.filter(m => m[8] === 'ACCESSIBLE').length;
  const blockedCount = machines.filter(m => m[8] !== 'ACCESSIBLE').length;

  console.log('=== Machine Inventory Seed ===');
  console.log(`Total machines: ${machines.length}`);
  console.log(`Accessible: ${accessibleCount}`);
  console.log(`Blocked: ${blockedCount}`);
  console.log('');

  for (const m of machines) {
    const req = pool.request();
    ['machineCode','locationName','ipAddress','port','localIp','machineType','scannerCode','locCode','accessStatus','dataSource','notes'].forEach((name, i) => req.input(name, (m as any)[i]));
    await req.query(`
      MERGE attendance_machines AS t
      USING (SELECT @machineCode AS machine_code) AS s ON t.machine_code=s.machine_code
      WHEN MATCHED THEN UPDATE SET location_name=@locationName, ip_address=@ipAddress, port=@port, local_ip=@localIp, machine_type=@machineType, scanner_code=@scannerCode, loc_code=@locCode, access_status=@accessStatus, data_source=@dataSource, notes=@notes, is_active=1, updated_at=SYSUTCDATETIME()
      WHEN NOT MATCHED THEN INSERT(machine_code,location_name,ip_address,port,local_ip,machine_type,scanner_code,loc_code,access_status,data_source,notes,is_active) VALUES(@machineCode,@locationName,@ipAddress,@port,@localIp,@machineType,@scannerCode,@locCode,@accessStatus,@dataSource,@notes,1);
    `);
    console.log(`  ${m[0]}: ${m[2]}:${m[3]} - ${m[8]}`);
  }

  await pool.request().query(`
    UPDATE attendance_machines
    SET is_active = 0,
        access_status = 'DISABLED',
        notes = COALESCE(notes + ' | ', '') + 'Disabled by canonical 16-machine inventory seed',
        updated_at = SYSUTCDATETIME()
    WHERE machine_code IN ('PGE', 'ARE', 'P2A')
  `);

  console.log('');
  console.log('Machine inventory seeded successfully!');
  await pool.close();
}

main().catch((error) => { console.error('seed-machine-inventory failed:', error.message); process.exit(1); });
