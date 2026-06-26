# ZKTeco Live Monitor

Desktop application untuk monitoring dan diagnostic mesin absensi ZKTeco secara langsung.

![ZKTeco Live Monitor](https://img.shields.io/badge/Platform-Windows-blue)
![Python](https://img.shields.io/badge/Python-3.10+-green)
![Flet](https://img.shields.io/badge/UI-Flet-orange)

## Features

### 1. Dashboard
- Overview 16 mesin absensi dengan status real-time
- Indikator online/offline untuk setiap mesin
- Auto-refresh setiap 30 detik
- Quick access ke Monitor dan Diagnostic

### 2. Live Monitor
- Real-time attendance stream dari mesin
- Tampilkan timestamp, employee ID, dan event type (Check-In/Check-Out)
- Auto-scroll dengan toggle
- READ-ONLY - tidak akan menghapus data

### 3. Diagnostic Panel
- **READ-ONLY Operations:**
  - Get Users - lihat daftar employee yang terdaftar
  - Get Attendance - lihat logs absensi
  - Get Device Info - info firmware, serial number, kapasitas
  - Sync Time - disabled in this read-only checker

- **DANGER ZONE:**
  - Tidak tersedia di tool ini

### 4. Employee Search
- Cari employee ID di seluruh mesin
- Berguna untuk troubleshooting "kenapa employee X tidak bisa absen?"
- Tampilkan di mesin mana employee terdaftar

## Safety First

⚠️ **READ-ONLY by default** - Aplikasi ini didesain untuk tidak menghapus data dari mesin.

Untuk operasi berbahaya (Clear, Reboot), diperlukan:
1. Konfirmasi dialog
2. Pengetikan manual kata konfirmasi (DELETE/REBOOT)

## Installation

### Prerequisites
- Python 3.10 or higher
- Windows 10/11 (Desktop app)

### Steps

1. **Clone atau download folder ini**

2. **Install dependencies:**
```bash
cd tools/zkteco-live-monitor
pip install -r requirements.txt
```

Tool ini memakai bridge `zkteco_bridge.cjs` yang memanggil `node-zklib` dari root repo, jadi Node.js harus tersedia di PATH.

3. **Konfigurasi mesin:**
Edit `machines.json` dengan IP address dan password mesin Anda:
```json
{
  "machines": [
    {
      "code": "P1A",
      "name": "P1A Estate",
      "ip": "10.0.0.5",
      "port": 4370,
      "password": "12345",
      "division": "P1A",
      "location_group": "Parit Gunung Estate",
      "is_active": true
    }
  ]
}
```

4. **Run:**
```bash
python main.py
```

Atau jalankan `run.bat` di Windows.

## Configuration

### machines.json

| Field | Description | Example |
|-------|-------------|---------|
| `code` | Kode unik mesin | `P1A` |
| `name` | Nama tampilan | `P1A Estate` |
| `ip` | IP address mesin | `10.0.0.5` |
| `port` | TCP port (default: 4370) | `4370` |
| `password` | Password mesin | `12345` |
| `division` | Nama divisi | `P1A` |
| `location_group` | Grup lokasi | `Parit Gunung Estate` |
| `is_active` | Aktif/nonaktif | `true` |

## Troubleshooting

### Cannot connect to machine
1. Pastikan IP address benar
2. Pastikan port 4370 tidak diblokir firewall
3. Pastikan mesin dalam jaringan yang sama
4. Cek password mesin (default: 12345)

### Machine shows offline
1. Cek kabel network mesin
2. Restart mesin
3. Gunakan Diagnostic > Get Device Info untuk info lebih lanjut

### Search tidak menemukan employee
1. Pastikan employee sudah terdaftar di mesin
2. Coba cari dengan ID lain (raw device ID vs employee code)
3. Gunakan Diagnostic > Get Users untuk lihat semua user

## Network Configuration

Mesin ZKTeco menggunakan TCP port 4370. Pastikan:
- Firewall allow outbound ke port 4370
- Mesin accessible dari PC yang menjalankan app

### Default Network Groups
| Location | IP Range |
|----------|----------|
| Parit Gunung Estate | 10.0.0.x |
| DME Estate | 103.144.228.x |
| Air Ruak Estate | 103.144.208.x |
| IJL Estate | 103.144.211.x |
| Mill | 103.127.66.x |

## License

Internal use only - PT Rebinmas Jaya

## Support

Untuk pertanyaan atau bug report, hubungi IT Support.
