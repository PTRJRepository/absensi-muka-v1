# Dokumentasi: Sinkronisasi User Name dari ZKTeco Machine

## Metadata

- **Tanggal:** 2026-06-25
- **Kategori:** Data Quality / Attendance Integrity
- **Status:** Risolusi Diperlukan
- **Prioritas:** HIGH

---

## 1. Ringkasan Masalah

Data `user_name` / nama employee dari ZKTeco machine **tidak selalu tersedia** di dalam attendance record yang dikirim oleh mesin ZKTeco saat `getAttendances()`. Akibatnya, `zkteco_user_name` di tabel `attendance_scan_logs` **sering NULL**, sehingga frontend tidak bisa menampilkan nama employee dengan benar.

### Root Cause

ZKTeco attendance log response (`getAttendances()`) **tidak selalu menyertakan user name**. User name hanya tersedia di dalam **user enrollment data** yang dikembalikan oleh `getUsers()`. Kedua data ini berasal dari call yang berbeda ke mesin ZKTeco.

```typescript
// Dua call terpisah ke mesin ZKTeco:
const usersResult = await zkteco.fetchUsers();       // ← contains user name
const attResult   = await zkteco.fetchAttendanceRecords(); // ← may NOT contain user name
```

---

## 2. Arsitektur Data Saat Ini

### 2.1 Tabel Utama

#### `attendance_scan_logs` — Raw scan records

| Kolom | Tipe | Deskripsi |
|-------|------|-----------|
| `id` | BIGINT | Primary key |
| `machine_id` | INT | FK ke `attendance_machines` |
| `machine_code` | NVARCHAR(30) | Kode mesin (e.g., `P1A`) |
| `raw_device_user_id` | NVARCHAR(100) | Device UID (e.g., `10044`) |
| `raw_user_sn` | NVARCHAR(100) | Serial number user |
| `raw_record_time` | DATETIME2 | Timestamp scan dari mesin |
| `raw_ip` | NVARCHAR(64) | IP address mesin |
| **`zkteco_user_name`** | **NVARCHAR(150)** | **Nama user dari mesin (sering NULL)** |
| `scan_time` | DATETIME2 | Timestamp scan (WIB) |
| `scan_date` | DATE | Tanggal scan (WIB) |
| `parsed_employee_code` | NVARCHAR(30) | Kode employee hasil mapping |
| `mapping_status` | NVARCHAR(30) | Status mapping |
| `sync_batch_id` | BIGINT | FK ke batch sync |

#### `machine_user_raw` — Enrolled users dari mesin

| Kolom | Tipe | Deskripsi |
|-------|------|-----------|
| `id` | INT IDENTITY | Primary key |
| `import_batch_id` | BIGINT | FK ke batch |
| `machine_id` | INT | FK ke `attendance_machines` |
| `machine_uid` | NVARCHAR(100) | Machine UID (internal ZKTeco) |
| **`machine_user_id`** | **NVARCHAR(100)** | **Device UID (mapping key)** |
| **`user_name`** | **NVARCHAR(150)** | **Nama lengkap dari mesin ✅** |
| `role` | NVARCHAR(50) | Role di mesin |
| `card_no` | NVARCHAR(100) | Card number |
| `password_exists` | BIT | Apakah ada password |
| `raw_payload` | NVARCHAR(MAX) | Full raw response JSON |

**Kunci join:** `machine_user_raw.machine_id + machine_user_raw.machine_user_id` ↔ `attendance_scan_logs.machine_id + attendance_scan_logs.raw_device_user_id`

---

## 3. Problem Detail

### 3.1 Problem 1: `zkteco_user_name` di `attendance_scan_logs` Sering NULL

**Lokasi kode:** `src/modules/import/sync-orchestrator.service.ts`

```typescript
// insertRawScanLog() — line ~62-65
const zktecoUserName =
    att.name == null && att.userName == null
      ? null
      : String(att.name ?? att.userName);
```

**Masalah:** ZKTeco attendance record (`att`) tidak selalu memiliki field `name` atau `userName`. Nilai ini tergantung pada konfigurasi mesin ZKTeco dan apakah mesin mengirimkan data tersebut dalam log response.

**Hasil:** Kolom `zkteco_user_name` di `attendance_scan_logs` **kebanyakan NULL**.

### 3.2 Problem 2: Join Path untuk Nama User

Saat ini, frontend menggunakan **dua sumber** untuk nama:

```sql
-- Sumber 1: attendance_scan_logs.zkteco_user_name (dari attendance record, sering NULL)
NULLIF(LTRIM(RTRIM(s.zkteco_user_name)), '')

-- Sumber 2: employees.employee_name (dari HR database)
${resolvedEmployeeNameSql()}
```

Namun, **Sumber 1 sering NULL** karena problem di atas.

### 3.3 Problem 3: `machine_user_raw` Belum Di-Join untuk Nama

Tabel `machine_user_raw` **sudah ada** dan **sudah terisi** dengan `user_name` dari `getUsers()`, tetapi **tidak digunakan** sebagai sumber nama di query attendance.

```sql
-- machine_user_raw.user_name TIDAK di-join di attendance queries:
-- attendance-raw.repository.ts JOINs machine_user_map
-- TAPI machine_user_raw.user_name TIDAK digunakan
```

---

## 4. Solusi yang Sudah Ada

### 4.1 Migration 057: `zkteco_user_name` Column

```sql
-- migrations/057_add_zkteco_user_name_to_scan_logs.sql
ALTER TABLE dbo.attendance_scan_logs
ADD zkteco_user_name NVARCHAR(150) NULL;
```

Kolom ini **sudah ada** di database, tapi **sering NULL** karena root cause-nya belum teratasi.

### 4.2 Sync Orchestrator Menyimpan ke `machine_user_raw`

```typescript
// sync-orchestrator.service.ts — line ~340-360
const users = (usersResult.data || []) as any[];
for (const user of users) {
    const rawUserId = pickAbsensiId(user.userId, user.id, user.uid, undefined);
    const userName = String(user.name ?? user.userName ?? '').trim();

    if (rawUserId) {
        await this.sqlClient.insert('machine_user_raw', {
            import_batch_id: batchId,
            machine_id: machine.machine_id,
            machine_uid: user.uid ?? null,
            machine_user_id: rawUserId,
            user_name: userName || null,  // ✅ user_name disimpan di sini
            role: user.role ?? null,
            card_no: user.cardno ?? user.cardNo ?? null,
            password_exists: Boolean(user.password),
            raw_payload: JSON.stringify(user),
        });
    }
}
```

**`getUsers()` ✅ sudah tersimpan** ke `machine_user_raw.user_name`.

### 4.3 Sync Orchestrator尝试 Menyimpan ke `zkteco_user_name`

```typescript
// insertRawScanLog() — zktecoUserName dari attendance record
const zktecoUserName =
    att.name == null && att.userName == null
      ? null
      : String(att.name ?? att.userName);

req.query(`
    INSERT INTO attendance_scan_logs (...)
    VALUES (... @zktecoUserName ...)
`);
```

**`zkteco_user_name` di-isi dari attendance record, tapi seringkali NULL.**

---

## 5. Solusi yang Diperlukan

### 5.1 Immediate Fix: Join `machine_user_raw.user_name`

Update query attendance untuk JOIN ke `machine_user_raw` dan mengambil `user_name`:

```sql
-- Setelah insert ke attendance_scan_logs, update zkteco_user_name:
UPDATE sl
SET    sl.zkteco_user_name = r.user_name
FROM   attendance_scan_logs sl
JOIN   machine_user_raw r
       ON  r.machine_id = sl.machine_id
       AND r.machine_user_id = sl.raw_device_user_id
WHERE  sl.zkteco_user_name IS NULL
       AND r.user_name IS NOT NULL
       AND LTRIM(RTRIM(r.user_name)) <> '';
```

**Lokasi kode:** `insertRawScanLog()` di `sync-orchestrator.service.ts` — setelah INSERT, jalankan UPDATE JOIN.

### 5.2 Long-term Fix: Sync `getUsers()` Terlebih Dahulu

Proses sync yang benar harus:

```
1. Sync getUsers() → machine_user_raw    ← PRIORITAS PERTAMA
2. Sync getAttendances()                  ← setelah users tersimpan
3. UPDATE attendance_scan_logs.zkteco_user_name
   dari machine_user_raw.user_name        ← JOIN otomatis
```

### 5.3 Backfill untuk Data Historis

```sql
-- Backfill zkteco_user_name dari machine_user_raw
UPDATE sl
SET    sl.zkteco_user_name = r.user_name
FROM   attendance_scan_logs sl
INNER JOIN machine_user_raw r
       ON  r.machine_id = sl.machine_id
       AND r.machine_user_id = sl.raw_device_user_id
WHERE  sl.zkteco_user_name IS NULL
       AND r.user_name IS NOT NULL
       AND LEN(LTRIM(RTRIM(r.user_name))) > 0;
```

---

## 6. Data Flow yang Seharusnya

```
┌─────────────────────────────────────────────────────────────────────┐
│                     ZKTeco Machine                                  │
│                                                                     │
│  ┌─────────────────────┐      ┌─────────────────────────────────┐ │
│  │  getUsers()         │      │  getAttendances()               │ │
│  │  → user.name ✅     │      │  → att.deviceUserId ✅          │ │
│  │  → user.userId ✅   │      │  → att.name ❌ (sering kosong)  │ │
│  └──────────┬───────────┘      └────────────┬────────────────────┘ │
│             │                               │                        │
└─────────────┼───────────────────────────────┼──────────────────────┘
              │                               │
              ▼                               ▼
┌──────────────────────────┐    ┌───────────────────────────────────┐
│  machine_user_raw        │    │  attendance_scan_logs              │
│  ┌──────────────────┐    │    │  ┌───────────────────────────┐    │
│  │ machine_user_id   │◄──┼────┼──│ raw_device_user_id         │    │
│  │ user_name ✅      │   │    │  │ zkteco_user_name ❌ NULL   │    │
│  │ role              │   │    │  └───────────────────────────┘    │
│  └──────────────────┘   │    │                                   │
└──────────┬───────────────┘    └───────────────┬───────────────────┘
           │                                      │
           │   UPDATE sl SET                      │
           │     sl.zkteco_user_name = r.user_name│
           │   FROM attendance_scan_logs sl       │
           │   JOIN machine_user_raw r            │
           │     ON r.machine_id = sl.machine_id  │
           │     AND r.machine_user_id = sl.raw_  │
           │   WHERE sl.zkteco_user_name IS NULL  │
           │         AND r.user_name IS NOT NULL  │
           ▼                                      ▼
┌──────────────────────────────────────────────────────────────────┐
│  attendance_scan_logs (FIXED)                                    │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ raw_device_user_id  │  zkteco_user_name (✅ FILLED)       │  │
│  │ 10044               │  BUDI SANTOSO                        │  │
│  │ 20015               │  ANI WULANDARI                       │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 7. Action Items

| # | Action | File | Status |
|---|--------|------|--------|
| 1 | Backfill `zkteco_user_name` dari `machine_user_raw` untuk data historis | SQL Migration | ❌ TODO |
| 2 | Update `insertRawScanLog()` untuk post-INSERT UPDATE JOIN | `sync-orchestrator.service.ts` | ❌ TODO |
| 3 | Verifikasi `getUsers()` sync sudah berjalan untuk semua mesin | `sync-orchestrator.service.ts` | ⚠️ perlu dicek |
| 4 | Update frontend API route untuk gunakan `zkteco_user_name` sebagai fallback | `machine-employee.routes.ts` | ⚠️ perlu dicek |

---

## 8. Referensi Kode

### 8.1 Sync Orchestrator — User Insert
**File:** `src/modules/import/sync-orchestrator.service.ts`
**Line:** ~340-360

```typescript
const users = (usersResult.data || []) as any[];
for (const user of users) {
  const rawUserId = pickAbsensiId(user.userId, user.id, user.uid, undefined);
  const userName = String(user.name ?? user.userName ?? '').trim();

  if (rawUserId) {
    await this.sqlClient.insert('machine_user_raw', {
      import_batch_id: batchId,
      machine_id: machine.machine_id,
      machine_uid: user.uid ?? null,
      machine_user_id: rawUserId,
      user_name: userName || null,        // ← sudah terisi
      role: user.role ?? null,
      card_no: user.cardno ?? user.cardNo ?? null,
      password_exists: Boolean(user.password),
      raw_payload: JSON.stringify(user),
    });
  }
}
```

### 8.2 Sync Orchestrator — Attendance Insert (Problem)
**File:** `src/modules/import/sync-orchestrator.service.ts`
**Line:** ~62-90

```typescript
function insertRawScanLog(pool, batchId, machine, att) {
  const rawDeviceUserId = pickAbsensiId(att.deviceUserId, ...);
  // ← user_name dari attendance record, SERING KOSONG
  const zktecoUserName =
      att.name == null && att.userName == null
        ? null
        : String(att.name ?? att.userName);

  req.query(`
    INSERT INTO attendance_scan_logs
      (machine_id, machine_code, raw_device_user_id, ..., zkteco_user_name, ...)
    VALUES
      (@machineId, @machineCode, @rawDeviceUserId, ..., @zktecoUserName, ...)
  `);
  // ← zktecoUserName sering NULL!
}
```

### 8.3 Join di Attendance Raw Repository
**File:** `src/modules/attendance/attendance-raw.repository.ts`
**Line:** ~72-80

```typescript
// JOIN ke machine_user_map (untuk emp_code mapping)
// TIDAK JOIN ke machine_user_raw (untuk user_name!)
async findByEmployee(empCode: string, dateFrom: Date, dateTo: Date) {
  const sql = `
    SELECT l.*
    FROM attendance_raw_log l
    JOIN machine_user_map m
      ON l.machine_id = m.machine_id
      AND l.machine_user_id = m.machine_user_id
    WHERE m.emp_code = '${empCode}' ...
  `;
}
```

---

## 9. Testing Checklist

- [ ] Cek apakah `machine_user_raw` terisi untuk semua mesin
  ```sql
  SELECT machine_code, COUNT(*) as total_users
  FROM machine_user_raw
  GROUP BY machine_code;
  ```
- [ ] Cek apakah `zkteco_user_name` NULL untuk data historis
  ```sql
  SELECT TOP 10 machine_code, raw_device_user_id, zkteco_user_name
  FROM attendance_scan_logs
  WHERE zkteco_user_name IS NULL;
  ```
- [ ] Verifikasi backfill berhasil
  ```sql
  SELECT TOP 10 machine_code, raw_device_user_id, zkteco_user_name
  FROM attendance_scan_logs
  WHERE zkteco_user_name IS NOT NULL;
  ```
- [ ] Test sync baru — pastikan `zkteco_user_name` terisi setelah sync

---

## 10. Kesimpulan

Masalah utama adalah **sinkronisasi urutan** dan **join yang belum dilakukan**:

1. ✅ `getUsers()` → `machine_user_raw.user_name` → **SUDAH** disimpan
2. ❌ `getAttendances()` → `zkteco_user_name` → **SERING NULL** (attendance record tidak punya name)
3. ❌ Join `machine_user_raw.user_name` → `attendance_scan_logs.zkteco_user_name` → **BELUM** dilakukan

**Solusi single SQL:**
```sql
UPDATE sl
SET    sl.zkteco_user_name = r.user_name
FROM   attendance_scan_logs sl
INNER JOIN machine_user_raw r
       ON  r.machine_id = sl.machine_id
       AND r.machine_user_id = sl.raw_device_user_id
WHERE  sl.zkteco_user_name IS NULL
       AND r.user_name IS NOT NULL
       AND LEN(LTRIM(RTRIM(r.user_name))) > 0;
```

**Setelah itu**, update `insertRawScanLog()` untuk post-INSERT UPDATE JOIN yang sama agar data baru juga terisi.
