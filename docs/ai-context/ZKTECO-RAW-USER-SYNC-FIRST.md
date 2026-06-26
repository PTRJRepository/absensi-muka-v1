# ZKTeco Raw User Sync First Architecture

## Metadata

- **Tanggal:** 2026-06-25
- **Status:** Design Complete — Pending Implementation
- **Prioritas:** HIGH
- **Kategori:** Data Quality / Attendance Integrity

---

## 1. Tujuan

Dokumentasi ini menjelaskan perubahan arsitektur sinkronisasi data user dari mesin ZKTeco. Tujuan utamanya adalah memastikan seluruh data user yang berasal dari `getUsers()` disimpan terlebih dahulu ke tabel raw, sebelum data attendance dari `getAttendances()` diproses dan di-join ke nama user.

Dengan desain ini, sistem tidak lagi bergantung pada `getAttendances()` untuk mendapatkan nama user, karena attendance record dari mesin ZKTeco sering hanya membawa ID dan waktu scan, bukan nama user.

---

## 2. Masalah Awal

Pada proses sync sebelumnya, sistem mengambil data attendance dari mesin ZKTeco menggunakan:

```typescript
getAttendances()
```

Lalu sistem mencoba mengisi nama user dari field:

```typescript
att.name
att.userName
```

Masalahnya, field tersebut sering kosong atau tidak dikirim oleh mesin. Akibatnya, kolom berikut di database sering bernilai `NULL`:

```sql
attendance_scan_logs.zkteco_user_name
```

Padahal nama user sebenarnya tersedia dari call lain, yaitu:

```typescript
getUsers()
```

Jadi akar masalahnya bukan karena nama user tidak ada di mesin, tetapi karena proses sinkronisasi belum menjadikan `getUsers()` sebagai sumber utama data raw user.

---

## 3. Prinsip Solusi

Solusi yang benar adalah:

```
Sync getUsers() dulu
        ↓
Simpan semua user mesin ke tabel raw user
        ↓
Sync getAttendances()
        ↓
Simpan scan log ke attendance_scan_logs
        ↓
Join attendance_scan_logs ke raw user table
        ↓
Isi zkteco_user_name / machine_raw_user_name
```

Prinsip penting:

1. Semua data user dari mesin harus disimpan dulu.
2. Data user dari mesin tidak boleh langsung dibuang.
3. `getUsers()` adalah sumber utama nama user ZKTeco.
4. `getAttendances()` adalah sumber utama scan waktu absensi.
5. Join dilakukan berdasarkan `machine_id` dan `raw_device_user_id`.
6. Nama dari HR tetap menjadi nama utama untuk tampilan HR.
7. Nama dari mesin dipakai untuk audit teknis dan verifikasi enrollment.

---

## 4. Alur Data

### 4.1 Alur Lama (MASALAH)

```
getAttendances()
      ↓
attendance_scan_logs
      ↓
zkteco_user_name sering NULL
      ↓
frontend tidak dapat menampilkan nama mesin
```

**Masalah:** `getAttendances()` tidak selalu membawa user name.

### 4.2 Alur Baru (SOLUSI)

```
getUsers()
      ↓
machine_user_raw
      ↓
getAttendances()
      ↓
attendance_scan_logs
      ↓
JOIN machine_user_raw
      ↓
attendance_scan_logs.zkteco_user_name terisi
```

---

## 5. Tabel Raw User Mesin

### 5.1 machine_user_raw Schema

```sql
CREATE TABLE machine_user_raw (
    id BIGINT IDENTITY(1,1) PRIMARY KEY,

    import_batch_id BIGINT NULL,

    machine_id INT NOT NULL,
    machine_code NVARCHAR(50) NOT NULL,

    machine_uid NVARCHAR(100) NULL,
    machine_user_id NVARCHAR(100) NOT NULL,

    user_name NVARCHAR(150) NULL,
    machine_raw_user_name NVARCHAR(150) NULL,

    role NVARCHAR(50) NULL,
    card_no NVARCHAR(100) NULL,
    password_exists BIT NULL,

    raw_payload NVARCHAR(MAX) NULL,

    first_seen_at DATETIME2 NULL,
    last_seen_at DATETIME2 NULL,

    imported_at DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    updated_at DATETIME2 NULL
);
```

**Catatan:**
- `user_name` = nama user dari `getUsers()`
- `machine_raw_user_name` = alias eksplisit untuk nama mentah dari mesin
- `raw_payload` = response asli dari mesin dalam JSON

### 5.2 Indexes

```sql
-- Primary dedup index
CREATE UNIQUE INDEX UQ_machine_user_raw_machine_user
ON machine_user_raw(machine_id, machine_user_id);

-- Lookup indexes
CREATE INDEX IX_machine_user_raw_machine_code_user
ON machine_user_raw(machine_code, machine_user_id);

CREATE INDEX IX_machine_user_raw_user_name
ON machine_user_raw(user_name);
```

---

## 6. Kunci Join

Join antara raw attendance dan raw user menggunakan:

```sql
attendance_scan_logs.machine_id = machine_user_raw.machine_id
attendance_scan_logs.raw_device_user_id = machine_user_raw.machine_user_id
```

**Fallback:** Jika `machine_id` tidak konsisten, boleh gunakan `machine_code + raw_device_user_id`.

---

## 7. Proses Sync Baru

### 7.1 Urutan Wajib

```
1. Connect ke mesin ZKTeco
2. Jalankan getUsers()
3. Simpan semua user ke machine_user_raw
4. Jalankan getAttendances()
5. Simpan scan ke attendance_scan_logs
6. Enrich attendance_scan_logs.zkteco_user_name dari machine_user_raw
7. Process attendance_imports
8. Tampilkan ke frontend
```

**Tidak boleh** menjalankan proses attendance final sebelum data user mesin disimpan.

### 7.2 Pseudocode

```typescript
async function syncMachine(machine) {
  const connection = await zkteco.connect(machine.ip, machine.port);

  // 1. Fetch & store users FIRST
  const usersResult = await connection.getUsers();
  await upsertMachineUsers({ machine, users: usersResult.data });

  // 2. Then fetch & store attendance
  const attendanceResult = await connection.getAttendances();
  await insertAttendanceLogs({ machine, records: attendanceResult.data });

  // 3. Enrich with user names from machine_user_raw
  await enrichAttendanceUserNames({
    machineId: machine.machine_id,
    machineCode: machine.machine_code
  });

  // 4. Process imports
  await processAttendanceImports({ machineCode: machine.machine_code });
}
```

---

## 8. Upsert Data User

### 8.1 Normalisasi User

```typescript
function normalizeZktecoUser(user: any) {
  const machineUserId = String(
    user.userId ?? user.uid ?? user.id ?? ''
  ).trim();

  const userName = String(
    user.name ?? user.userName ?? ''
  ).trim();

  return {
    machineUserId,
    machineUid: user.uid ?? null,
    userName: userName || null,
    role: user.role ?? null,
    cardNo: user.cardno ?? user.cardNo ?? null,
    passwordExists: Boolean(user.password),
    rawPayload: JSON.stringify(user)
  };
}
```

### 8.2 SQL MERGE

```sql
MERGE machine_user_raw AS target
USING (
    SELECT
        @import_batch_id AS import_batch_id,
        @machine_id AS machine_id,
        @machine_code AS machine_code,
        @machine_uid AS machine_uid,
        @machine_user_id AS machine_user_id,
        @user_name AS user_name,
        @machine_raw_user_name AS machine_raw_user_name,
        @role AS role,
        @card_no AS card_no,
        @password_exists AS password_exists,
        @raw_payload AS raw_payload
) AS source
ON target.machine_id = source.machine_id
AND target.machine_user_id = source.machine_user_id

WHEN MATCHED THEN
    UPDATE SET
        target.import_batch_id = source.import_batch_id,
        target.machine_code = source.machine_code,
        target.machine_uid = source.machine_uid,
        target.user_name = source.user_name,
        target.machine_raw_user_name = source.machine_raw_user_name,
        target.role = source.role,
        target.card_no = source.card_no,
        target.password_exists = source.password_exists,
        target.raw_payload = source.raw_payload,
        target.last_seen_at = SYSDATETIME(),
        target.updated_at = SYSDATETIME()

WHEN NOT MATCHED THEN
    INSERT (
        import_batch_id, machine_id, machine_code, machine_uid,
        machine_user_id, user_name, machine_raw_user_name, role,
        card_no, password_exists, raw_payload,
        first_seen_at, last_seen_at, imported_at
    )
    VALUES (
        source.import_batch_id, source.machine_id, source.machine_code,
        source.machine_uid, source.machine_user_id, source.user_name,
        source.machine_raw_user_name, source.role, source.card_no,
        source.password_exists, source.raw_payload,
        SYSDATETIME(), SYSDATETIME(), SYSDATETIME()
    );
```

---

## 9. Insert Attendance dengan Fallback Nama

```typescript
const nameFromAttendance =
  att.name == null && att.userName == null
    ? null
    : String(att.name ?? att.userName).trim();

// Sistem TIDAK boleh berhenti di situ jika nama kosong
// Harus lanjut ambil dari machine_user_raw

const nameFromRawUser = await findMachineRawUserName(
  machine.machine_id,
  rawDeviceUserId
);

const finalZktecoUserName =
  nameFromAttendance ||
  nameFromRawUser ||
  null;

const nameSource =
  nameFromAttendance
    ? 'ATTENDANCE_RECORD'
    : nameFromRawUser
      ? 'MACHINE_USER_RAW'
      : 'UNKNOWN';
```

---

## 10. Enrich Nama Setelah Insert Attendance

```sql
UPDATE sl
SET
    sl.zkteco_user_name = COALESCE(
        NULLIF(LTRIM(RTRIM(sl.zkteco_user_name)), ''),
        LTRIM(RTRIM(r.user_name))
    ),
    sl.zkteco_user_name_source =
        CASE
            WHEN sl.zkteco_user_name IS NOT NULL
                 AND LTRIM(RTRIM(sl.zkteco_user_name)) <> ''
            THEN 'ATTENDANCE_RECORD'
            ELSE 'MACHINE_USER_RAW'
        END,
    sl.zkteco_user_name_synced_at = SYSDATETIME(),
    sl.zkteco_user_name_sync_status = 'FILLED'
FROM attendance_scan_logs sl
JOIN machine_user_raw r
    ON r.machine_id = sl.machine_id
   AND r.machine_user_id = sl.raw_device_user_id
WHERE
    sl.machine_id = @machine_id
    AND (sl.zkteco_user_name IS NULL OR LTRIM(RTRIM(sl.zkteco_user_name)) = '')
    AND r.user_name IS NOT NULL
    AND LEN(LTRIM(RTRIM(r.user_name))) > 0;
```

---

## 11. Kolom Metadata Tambahan

### 11.1 Schema Changes

```sql
ALTER TABLE attendance_scan_logs ADD
    zkteco_user_name_source NVARCHAR(30) NULL,
    zkteco_user_name_synced_at DATETIME2 NULL,
    zkteco_user_name_sync_status NVARCHAR(30) NULL;
```

### 11.2 Nilai `zkteco_user_name_source`

| Nilai | Deskripsi |
|-------|-----------|
| `ATTENDANCE_RECORD` | Nama berasal dari attendance record mesin |
| `MACHINE_USER_RAW` | Nama berasal dari `machine_user_raw` (getUsers) |
| `UNKNOWN` | Tidak ditemukan di mana pun |

### 11.3 Nilai `zkteco_user_name_sync_status`

| Nilai | Deskripsi |
|-------|-----------|
| `FILLED` | Nama berhasil terisi |
| `NO_RAW_USER` | Tidak ada raw user di `machine_user_raw` |
| `EMPTY_RAW_USER_NAME` | Raw user ada tapi `user_name` kosong |
| `CONFLICT` | Konflik nama antara sources |
| `ERROR` | Error saat sync |

---

## 12. Backfill Data Lama

### 12.1 Fill dari machine_user_raw

```sql
UPDATE sl
SET
    sl.zkteco_user_name = LTRIM(RTRIM(r.user_name)),
    sl.zkteco_user_name_source = 'MACHINE_USER_RAW',
    sl.zkteco_user_name_synced_at = SYSDATETIME(),
    sl.zkteco_user_name_sync_status = 'FILLED'
FROM attendance_scan_logs sl
JOIN machine_user_raw r
    ON r.machine_id = sl.machine_id
   AND r.machine_user_id = sl.raw_device_user_id
WHERE
    (sl.zkteco_user_name IS NULL OR LTRIM(RTRIM(sl.zkteco_user_name)) = '')
    AND r.user_name IS NOT NULL
    AND LEN(LTRIM(RTRIM(r.user_name))) > 0;
```

### 12.2 Tandai yang Tidak Bisa Diisi

```sql
UPDATE sl
SET
    sl.zkteco_user_name_sync_status = 'NO_RAW_USER',
    sl.zkteco_user_name_synced_at = SYSDATETIME()
FROM attendance_scan_logs sl
LEFT JOIN machine_user_raw r
    ON r.machine_id = sl.machine_id
   AND r.machine_user_id = sl.raw_device_user_id
WHERE
    (sl.zkteco_user_name IS NULL OR LTRIM(RTRIM(sl.zkteco_user_name)) = '')
    AND r.id IS NULL;
```

---

## 13. Display Name Rule

Untuk tampilan ke user HR, nama utama tetap harus dari HR jika tersedia.

**Urutan prioritas display name:**

```
1. employees.current_emp_name       ← HR master name
2. employees.employee_name         ← HR name
3. attendance_scan_logs.zkteco_user_name
4. machine_user_raw.user_name
5. current_emp_code
6. parsed_employee_code
7. raw_device_user_id
8. "-"                             ← fallback
```

`machine_user_raw.user_name` **bukan** pengganti master HR, tetapi dipakai sebagai data pendukung dan fallback.

---

## 14. API Response Format

Endpoint attendance sebaiknya mengembalikan:

```json
{
  "employee_code": "B0193",
  "current_emp_code": "B0193",
  "display_name": "USWATUL HASANAH",
  "hr_employee_name": "USWATUL HASANAH",
  "zkteco_user_name": "USWATUL HASANAH",
  "machine_raw_user_name": "USWATUL HASANAH",
  "zkteco_user_name_source": "MACHINE_USER_RAW",
  "zkteco_user_name_sync_status": "FILLED",
  "raw_device_user_id": "3000193",
  "machine_code": "P1B"
}
```

---

## 15. Validasi SQL Queries

### 15.1 Cek Jumlah User Raw per Mesin

```sql
SELECT
    machine_code,
    COUNT(*) AS total_raw_users,
    SUM(CASE WHEN user_name IS NULL OR LTRIM(RTRIM(user_name)) = ''
             THEN 1 ELSE 0 END) AS empty_name_count
FROM machine_user_raw
GROUP BY machine_code
ORDER BY machine_code;
```

### 15.2 Cek Attendance yang Nama Mesinnya Masih Kosong

```sql
SELECT
    machine_code,
    COUNT(*) AS total_missing_name
FROM attendance_scan_logs
WHERE zkteco_user_name IS NULL
   OR LTRIM(RTRIM(zkteco_user_name)) = ''
GROUP BY machine_code
ORDER BY total_missing_name DESC;
```

### 15.3 Cek Berapa yang Bisa Diisi dari Raw User

```sql
SELECT
    sl.machine_code,
    COUNT(*) AS fillable_count
FROM attendance_scan_logs sl
JOIN machine_user_raw r
    ON r.machine_id = sl.machine_id
   AND r.machine_user_id = sl.raw_device_user_id
WHERE
    (sl.zkteco_user_name IS NULL OR LTRIM(RTRIM(sl.zkteco_user_name)) = '')
    AND r.user_name IS NOT NULL
    AND LEN(LTRIM(RTRIM(r.user_name))) > 0
GROUP BY sl.machine_code
ORDER BY fillable_count DESC;
```

### 15.4 Sample Join Verification

```sql
SELECT TOP 100
    sl.machine_code,
    sl.raw_device_user_id,
    sl.zkteco_user_name,
    r.user_name AS machine_raw_user_name,
    sl.parsed_employee_code,
    sl.current_emp_code,
    sl.scan_time
FROM attendance_scan_logs sl
LEFT JOIN machine_user_raw r
    ON r.machine_id = sl.machine_id
   AND r.machine_user_id = sl.raw_device_user_id
ORDER BY sl.scan_time DESC;
```

---

## 16. Acceptance Criteria

| ID | Criteria | Expected Result |
|----|----------|----------------|
| **AC-001** | Semua User dari `getUsers()` Tersimpan | `COUNT(*) > 0` per mesin setelah sync |
| **AC-002** | Tidak Ada Duplikasi User | 0 rows dari HAVING COUNT(*) > 1 |
| **AC-003** | Nama Scan Log Terisi dari Raw User | `COUNT(*)` dengan `zkteco_user_name_source = 'MACHINE_USER_RAW'` > 0 |
| **AC-004** | Sync Mengikuti Urutan yang Benar | Log menunjukkan: users → attendance → enrichment |
| **AC-005** | Jika `getUsers()` Gagal, Attendance Tetap Masuk | Status = `NO_RAW_USER`, tidak error |
| **AC-006** | Frontend Tidak Menampilkan null | Null/undefined ditampilkan sebagai "-" |

---

## 17. Implementation Checklist

- [ ] Buat migration untuk kolom metadata (`zkteco_user_name_source`, `zkteco_user_name_synced_at`, `zkteco_user_name_sync_status`)
- [ ] Update `sync-orchestrator.service.ts` — pastikan `getUsers()` dipanggil Duluan
- [ ] Implementasi MERGE/UPSERT untuk `machine_user_raw`
- [ ] Implementasi `enrichAttendanceUserNames()` — UPDATE JOIN setelah insert attendance
- [ ] Backfill data lama
- [ ] Update API response untuk kembalikan `zkteco_user_name_source` dan `zkteco_user_name_sync_status`
- [ ] Update frontend — handle display name dengan prioritas yang benar

---

## 18. Kesimpulan

Arsitektur yang benar adalah menyimpan semua user mesin terlebih dahulu ke raw table.

**Final flow:**

```
getUsers()
    ↓
machine_user_raw
    ↓
getAttendances()
    ↓
attendance_scan_logs
    ↓
join raw attendance ke raw user
    ↓
zkteco_user_name terisi
```

Dengan pola ini, sistem tidak lagi bergantung pada nama dari attendance record yang sering kosong. Semua nama dari mesin tersimpan sebagai raw data, bisa diaudit, dan bisa digunakan ulang untuk backfill maupun sync berikutnya.
