# Panduan Komprehensif Penggunaan Layanan (API Gateway)

Dokumen ini berisi panduan teknis dan operasional untuk seluruh layanan (services) yang terintegrasi di dalam API Gateway PT Rebinmas Jaya.

## Daftar Isi
1. [Ringkasan Arsitektur](#ringkasan-arsitektur)
2. [Layanan Utama (Dashboard Portal)](#1-layanan-utama-dashboard-portal)
3. [Sistem Penggajian / Payroll (Upah)](#2-sistem-penggajian--payroll-upah)
4. [Sistem Absensi Karyawan](#3-sistem-absensi-karyawan)
5. [Monitoring Distribusi Beras](#4-monitoring-distribusi-beras)
6. [SQL Gateway API (Query)](#5-sql-gateway-api-query)
7. [Gdrive Gateway (File Management)](#6-gdrive-gateway-file-management)
8. [Manajemen Konfigurasi Gateway](#7-manajemen-konfigurasi-gateway)

---

## Ringkasan Arsitektur

API Gateway berjalan pada port **3001** dan bertindak sebagai pintu masuk tunggal (Single Entry Point) untuk seluruh aplikasi internal.

| Nama Layanan | Path Gateway | Port Internal | Deskripsi |
|--------------|--------------|---------------|-----------|
| **Dashboard** | `/` | 3001 | Portal utama, Login & Admin |
| **Upah (App)** | `/upah` | 8002 | Frontend Sistem Penggajian |
| **Upah (API)** | `/backend/upah` | 8002 | API Backend Penggajian |
| **Absensi** | `/absen` | 5176 | Monitoring Kehadiran |
| **Beras** | `/monitoring-beras` | 5177 | Logistik Distribusi Beras |
| **Query API** | `/query` | 8001 | Interface SQL Server (Public - No Auth) |
| **Gdrive** | `/file` | 5178 | Integrasi Google Drive |

---

## 1. Layanan Utama (Dashboard Portal)
Portal terpusat untuk autentikasi dan navigasi antar aplikasi.

- **Akses**: `http://localhost:3001/`
- **Fitur**:
  - **Single Sign-On (SSO)**: Login satu kali untuk mengakses semua layanan.
  - **Role-Based Access**: Menu layanan yang muncul otomatis sesuai hak akses (Admin, Kerani, Visitor).
  - **Panel Admin**: Menu `/admin` untuk mengelola user dan hak akses per role.

---

## 2. Sistem Penggajian / Payroll (Upah)
Aplikasi manajemen gaji karyawan yang mendukung rekapitulasi data otomatis.

- **Frontend**: `http://localhost:3001/upah`
- **Backend API**: `http://localhost:3001/backend/upah`
- **Struktur Path Internal**:
  - `/upah/payroll`: Kelola data penggajian.
  - `/upah/employee`: Data master karyawan.
  - `/upah/report`: Laporan bulanan dan slip gaji.
- **Teknis**: Menggunakan fitur *Content Rewriting* untuk memuat asset (JS/CSS) dari port 8002 secara transparan.

---

## 3. Sistem Absensi Karyawan
Sistem pelaporan kehadiran mandiri oleh Kerani divisi.

- **Akses**: `http://localhost:3001/absen`
- **Integrasi API**:
  - `GET /api/attendance`: Mengambil data kehadiran terpusat.
  - `GET /api/attendance-by-loc-enhanced`: Data kehadiran berbasis lokasi.
- **Penggunaan**: Pilih Divisi -> Input Kehadiran -> Simpan. Data akan otomatis masuk ke database pusat.

---

## 4. Monitoring Distribusi Beras
Layanan pemantauan logistik untuk pembagian bantuan beras karyawan.

- **Akses**: `http://localhost:3001/monitoring-beras`
- **Fungsi**: Memastikan setiap karyawan menerima jatah beras sesuai data payroll. Terintegrasi dengan database karyawan di SQL Server.

---

## 5. SQL Gateway API (Query)
Layanan perantara untuk mengeksekusi query SQL Server secara aman melalui HTTP.

- **URL Base**: `http://localhost:3001/query`
- **Catatan**: Prefix `/query` tidak dihapus saat diteruskan ke backend (Port 8001).
- **Akses**: **PUBLIK** - Tidak memerlukan autentikasi. Route ini dikecualikan dari sistem SSO.
- **Use Case**: Untuk integrasi dengan sistem eksternal, script automation, atau layanan internal yang memerlukan akses langsung ke database.

> **Catatan**: Route dengan properti `"public": true` di `routes-config.json` akan selalu dapat diakses tanpa login.

---

## 6. Gdrive Gateway (File Management)
Layanan untuk mengunggah dan mengambil dokumen dari Google Drive secara terprogram.

- **Akses**: `http://localhost:3001/file`
- **Endpoint Operasional**:
  - **Upload**: `POST /file/upload`
  - **Search**: `GET /file/search?q=kata_kunci`
  - **Download**: `GET /file/download/{file_id}`
- **Contoh Integrasi**:
  ```bash
  curl -X POST http://localhost:3001/file/upload -F "file=@berkas.pdf"
  ```

---

## 7. Manajemen Konfigurasi Gateway
Layanan khusus untuk administrator guna memantau dan mengubah rute secara dinamis.

- **UI Konfigurasi**: `http://localhost:3001/config-path`
- **Fitur**:
  - Menambah rute baru tanpa restart server.
  - Mengaktifkan/Menonaktifkan service secara instan.
  - Pengecekan status kesehatan (Health Check) setiap port service.

### Properti Konfigurasi Route
Setiap route di `routes-config.json` mendukung properti berikut:

| Properti | Tipe | Deskripsi |
|----------|------|-----------|
| `id` | string | Identifier unik route |
| `path` | string | Path URL di gateway |
| `target` | string | URL backend tujuan |
| `enabled` | boolean | Aktif/nonaktif route |
| `public` | boolean | **Jika `true`, route dapat diakses tanpa login** |
| `rewriteContent` | boolean | Aktifkan rewrite HTML/JS/CSS |
| `rewritePath` | boolean | Hapus prefix path saat forwarding |

> **Tips**: Untuk membuat route publik (tanpa autentikasi), tambahkan `"public": true` pada konfigurasi route.

---

## Troubleshooting & FAQ

**Q: Mengapa muncul pesan "502 Bad Gateway"?**
**A**: Service backend belum dijalankan. Pastikan service (misal Port 5178 untuk Gdrive) sudah menyala.

**Q: Apakah path asli (misal Port 8002) masih bisa diakses langsung?**
**A**: Ya, di dalam jaringan lokal. Namun sangat disarankan menggunakan Port 3001 agar melewati sistem autentikasi terpusat.

**Q: Bagaimana cara menambah user baru?**
**A**: Login sebagai Admin di Portal Utama, buka menu **Admin Panel** -> **Pengguna** -> **Tambah User**.

---
**Digital Transformation - PT Rebinmas Jaya**
