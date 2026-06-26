# Dokumentasi: Masalah Data Intermittent (Muncul-Hilang)

**Versi**: 1.0
**Tanggal**: 2026-06-22
**Kategori**: Root Cause Analysis

---

## 1. Masalah yang Dialami

**Gejala**: Data absensi karyawan **muncul-hilang** (intermittent):
- Hari Senin: Ada data (HADIR)
- Hari Selasa: Tidak ada data (AA/tidak muncul)
- Hari Rabu: Ada data lagi
- Hari Kamis: Hilang lagi

**Seharusnya**: Jika karyawan hadir, data seharusnya **konsisten** muncul setiap hari.

---

## 2. Root Cause: ID Selection Bug

### File: `src/shared/absensi-id.ts`

```typescript
function scoreAbsensiId(value: string): number {
  if (!value) return -1;

  if (/^\d+$/.test(value)) {
    return value.length > 5
      ? 100000 + value.length   // ← BUG: LONG ID mendapat score TINGGI!
      : 1000 + value.length;    // ← SHORT ID mendapat score RENDAH
  }

  return 100 + value.length;
}
```

### Masalah:

| ID Value | Length | Score | Hasil |
|----------|--------|-------|-------|
| "10044" | 5 digit | 1004 | Kalah dari ID panjang |
| "100123456" | 9 digit | 100009 | DIPILIH (karena score lebih tinggi) |

**Akibat**: Sistem SELALU memilih ID panjang (9+ digit) meskipun ada ID pendek (5 digit).

---

## 3. Dampak: Data Tidak Muncul di Matriks

### File: `src/modules/import/sync-orchestrator.service.ts:342-356`

```typescript
const rawDeviceUserId = pickAbsensiId(...);  // ← Pilih ID panjang!

const isLongAbsensiId = /^\d+$/.test(rawDeviceUserId) && rawDeviceUserId.length > 5;
// isLongAbsensiId = true (karena ID panjang)

const mappingReason = empCode?.rule ?? (isLongAbsensiId
  ? `LONG_RAW_ID_LENGTH_${rawDeviceUserId.length}`  // "LONG_RAW_ID_LENGTH_9"
  : 'unmapped_device_user');

await this.sqlClient.insert('attendance_scan_logs', {
  // ...
  parsed_employee_code: empCode?.empCode ?? null,  // ← NULL karena ID panjang tidak bisa di-map!
  mapping_status: empCode ? 'MAPPED' : 'NEED_REVIEW',  // ← NEED_REVIEW
  // ...
});
```

### Hasil:

| Kondisi | `parsed_employee_code` | `mapping_status` | Muncul di Matriks? |
|---------|------------------------|------------------|---------------------|
| ID pendek (5 digit) | "A0044" ✅ | MAPPED | Ya ✅ |
| ID panjang (9 digit) | NULL ❌ | NEED_REVIEW | Tidak ❌ |

---

## 4. Mengapa Bisa Selang-Seling?

**Jawab**: Tergantung **ID apa yang dikirim mesin ZKTeco** setiap scan:

```
Scan 1 (Senin):    Mesin kirim ID "10044" (5 digit) → Mapped ✅ → Muncul di matrix
Scan 2 (Selasa):   Mesin kirim ID "100123456" (9 digit) → Excluded ❌ → Tidak muncul
Scan 3 (Rabu):     Mesin kirim ID "10044" (5 digit) → Mapped ✅ → Muncul lagi
Scan 4 (Kamis):    Mesin kirim ID "100123456" (9 digit) → Excluded ❌ → Hilang lagi
```

**Bukan masalah keadilan** — ini adalah **bug di sistem** yang memilih ID yang salah.

---

## 5. Mapping Logic: Kenapa ID Panjang Gagal?

### File: `src/modules/employees/employee-mapping.service.ts:75-139`

```typescript
convertDeviceUserIdToEmpCodeWithLookup(...) {
  // STEP 0: Direct match
  if (employeeCodes.has(userId)) {
    return { empCode: userId, ... };  // "100123456" tidak ada di employees table
  }

  // STEP 1: Scanner code mapping
  // userId = "100123456"
  // last4 = "3456"  ← Ambil 4 digit terakhir
  // generatedCode = "A3456"  ← Bukan employee code yang valid!
  if (employeeCodes.has(generatedCode)) {
    return { empCode: generatedCode, ... };
  }

  // Semua step gagal → return null
  return null;
}
```

**Contoh**:
- ID: "100123456" (PGE machine, scannerCode=100)
- `last4 = "3456"`
- `generatedCode = "A3456"`
- Tapi employee code yang benar adalah "A0044"
- **Tidak match** → mapping gagal → data tidak muncul

---

## 6. Konfigurasi Employee Code

Dari CLAUDE.md:

| Scanner | Division | locCode | userId Example | emp_code |
|---------|----------|---------|----------------|----------|
| 100 | P1A | A | "10044" | "A0044" |
| 200 | ARC | J | "20015" | "J0015" |
| 300 | P1B | B | "30232" | "B0232" |

**Logika**: `emp_code = {locCode}{last 4 digits of userId}`

**Contoh**:
- userId: "10044" → last4: "0044" → emp_code: "A0044" ✅
- userId: "100123456" → last4: "3456" → emp_code: "A3456" ❌ (salah!)

---

## 7. Checklist untuk Verifikasi

### SQL Query: Cek data dengan ID panjang

```sql
-- Cek semua scan dengan ID > 5 digit
SELECT
  machine_code,
  raw_device_user_id,
  LEN(raw_device_user_id) AS id_length,
  COUNT(*) AS scan_count,
  MIN(scan_date) AS first_scan,
  MAX(scan_date) AS last_scan
FROM attendance_scan_logs
WHERE LEN(raw_device_user_id) > 5
GROUP BY machine_code, raw_device_user_id
ORDER BY scan_count DESC;

-- Cek mapping status
SELECT
  mapping_status,
  COUNT(*) AS total,
  SUM(CASE WHEN parsed_employee_code IS NULL THEN 1 ELSE 0 END) AS without_code
FROM attendance_scan_logs
GROUP BY mapping_status;

-- Cek employee yang affected (mungkin ada di raw tapi tidak di matrix)
SELECT TOP 20
  raw_device_user_id,
  LEN(raw_device_user_id) AS id_length,
  COUNT(*) AS scan_count
FROM attendance_scan_logs
WHERE LEN(raw_device_user_id) > 5
GROUP BY raw_device_user_id
ORDER BY scan_count DESC;
```

---

## 8. Solusi yang Diperlukan

### Opsi A: Fix `pickAbsensiId` (Short ID Priority)

```typescript
// BEFORE (BUG):
return value.length > 5
  ? 100000 + value.length   // ← LONG ID = prioritas tinggi
  : 1000 + value.length;

// AFTER (FIX):
return value.length > 5
  ? 500 + value.length    // ← LONG ID = prioritas rendah
  : 1000 + value.length; // ← SHORT ID = prioritas tinggi
```

### Opsi B: Always Use Short ID if Available

```typescript
export function pickAbsensiId(...values: unknown[]): string {
  const candidates: string[] = [];

  for (const value of values) {
    const normalized = normalizeAbsensiId(value);
    if (!normalized) continue;

    // Prioritas: 5-digit ID > 9+ digit ID
    if (/^\d{5}$/.test(normalized)) {
      return normalized; // ← Return langsung jika ada 5-digit
    }
    candidates.push(normalized);
  }

  // Fallback: pilih yang terpendek dari kandidat
  return candidates.sort((a, b) => a.length - b.length)[0] || '';
}
```

### Opsi C: Fix Mapping Logic untuk ID Panjang

Jika ID panjang adalah format yang sebenarnya, perlu adjust mapping logic:
```typescript
// Ambil digit yang sesuai, bukan hanya last4
// Atau gunakan middle digits
```

---

## 9. File yang Perlu Diperbaiki

| File | Line | Masalah |
|------|------|---------|
| `src/shared/absensi-id.ts` | 9-12 | Score function memilih ID panjang |
| `src/modules/import/sync-orchestrator.service.ts` | 342 | ID selection |

---

## 10. Rekomendasi Aksi

1. **Verifikasi** dengan query SQL di section 7
2. **Identifikasi** employee yang affected
3. **Implementasi** fix (Opsi A atau B)
4. **Re-sync** data yang hilang (scan dengan ID panjang)
5. **Monitoring** setelah fix

---

## 11. Kesimpulan

| Aspek | Penjelasan |
|-------|------------|
| **Bukan masalah keadilan** | Ini adalah bug teknis |
| **Root cause** | `pickAbsensiId` memilih ID panjang (score tinggi) |
| **Dampak** | ID panjang tidak bisa di-map → data tidak muncul |
| **Solusi** | Fix score function agar preferensi ke ID pendek (5 digit) |
| **Re-sync** | Data yang sudah masuk dengan ID panjang perlu di-reprocess |

---

*Generated: 2026-06-22*
