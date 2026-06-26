# Access Guide & Troubleshooting — Mesin Absensi

## Quick Reference

| Item | Nilai |
|------|-------|
| Password mesin ZKTeco | `12345` |
| ZKTeco Lib | `node-zklib@1.3.0` |
| API IT Solution | `http://10.0.0.110:5176` |
| SQL Gateway | `http://10.0.0.110:8001/v1/query` |
| API Key | `<API_KEY>` |
| SQL Server | `SERVER_PROFILE_1 / extend_db_ptrj` |

## Cara Connect ke Mesin ZKTeco

### Step 1: Install Library

```bash
npm install node-zklib
```

### Step 2: Connect

```javascript
const ZKLib = require('node-zklib');
const zk = new ZKLib('IP', PORT, 20000, PORT);
await zk.createSocket();
```

### Step 3: Auth (jika diperlukan)

```javascript
const { COMMANDS } = require('node-zklib/constants');
await zk.zklibTcp.executeCmd(COMMANDS.CMD_AUTH, Buffer.from('12345'));
```

### Step 4: Ambil Data

```javascript
await zk.zklibTcp.disableDevice();
const info = await zk.zklibTcp.getInfo();
const users = await zk.zklibTcp.getUsers();
const att = await zk.zklibTcp.getAttendances();
await zk.zklibTcp.enableDevice();
await zk.disconnect();
```

---

## Troubleshooting

### Error 1: `ECONNREFUSED`

**Gejala:**
```
Error: connect ECONNREFUSED 103.144.228.42:4370
```

**Penyebab:** Port tidak terbuka di mesin target.

**Solusi:**
1. Pastikan IP dan port benar (cek `02-machine-configuration.md`)
2. Cek port forwarding di router — mesin biasanya di LAN (192.168.1.x)
3. Verifikasi mesin menyala dan terhubung network
4. Coba scan port:

```bash
# Quick scan port
node -e "
const net = require('net');
const sock = new net.Socket();
sock.setTimeout(2000);
sock.on('connect', () => { console.log('OPEN'); sock.destroy(); });
sock.on('error', (e) => { console.log('CLOSED:', e.message); sock.destroy(); });
sock.connect(PORT, 'IP');
"
```

### Error 2: `TIMEOUT_ON_WRITING_MESSAGE` / Timeout

**Gejala:**
```
Error: TIMEOUT_ON_WRITING_MESSAGE
Error: TIME OUT !! 11 PACKETS REMAIN !
```

**Penyebab:**
- Mesin lambat merespons (data besar)
- Network latency tinggi
- Timeout terlalu pendek

**Solusi:**
1. Tingkatkan timeout: `new ZKLib(ip, port, 30000, port)`
2. Data partial tetap bisa diproses (error "N PACKETS REMAIN" = sebagian data sudah diterima)
3. Coba lagi dengan delay antar mesin

### Error 3: `offset out of range`

**Gejala:**
```
RangeError: The value of "offset" is out of range. It must be >= 0 and <= 4. Received 24
```

**Penyebab:** Device bukan ZKTeco atau firmware custom yang tidak kompatibel dengan library.

**Solusi:**
1. Coba library alternatif: `zklib@0.2.11`
   ```javascript
   const ZK = require('zklib');
   const zk = new ZK({ ip, port, inport: port, timeout: 20000 });
   await zk.connect();
   const users = await zk.getUser();
   const att = await zk.getAttendance();
   ```
2. Jika masih gagal → data kemungkinan via API IT Solution
3. Cek apakah ada di mapping divisi API

### Error 4: CMD_CONNECT tidak respons

**Gejala:** TCP connected tapi tidak ada response setelah kirim CMD_CONNECT.

**Penyebab:** Device bukan ZKTeco — kemungkinan brand lain (FingerTec, Solution, dll).

**Solusi:** Gunakan API IT Solution sebagai sumber data. Data dari device ini biasanya sudah diproses oleh sistem IT Solution.

### Error 5: `getUsers` / `getAttendances` return 0 records

**Penyebab:**
- Library method name salah
- Device belum di-authenticate

**Solusi:**
1. Pastikan sudah auth dengan password "12345"
2. Cek method name sesuai library:
   - `node-zklib`: `getUsers()`, `getAttendances()`
   - `zklib`: `getUser()`, `getAttendance()` (tanpa 's')

### Error 6: `Cannot call write after a stream was destroyed`

**Penyebab:** Socket sudah disconnect saat mencoba write.

**Solusi:**
1. Tambahkan delay antar operasi
2. Jangan reuse socket yang sudah disconnected
3. Buat instance ZKLib baru untuk setiap mesin

---

## Port Forwarding yang Diperlukan

Untuk mesin yang belum bisa diakses dari luar network:

### Group ARA/ARC/AB (103.144.208.154)
Port forwarding yang perlu ditambahkan di router:
```
External 4900 → 192.168.1.231:4900 (AB1)
External 4200 → 192.168.1.235:4200 (ARC_01)
External 4201 → 192.168.1.236:4201 (ARC_02)
```

### Group PGE (223.25.98.220)
Port forwarding yang perlu ditambahkan:
```
External 4500 → 10.0.0.92:4500 (P2A)
External 4600 → 10.0.0.93:4600 (P2B)
```

**Catatan:** P1A (10.0.0.90:4100) dan P1B (10.0.0.91:4300) port-nya SUDAH terbuka tapi device bukan ZKTeco. Tidak perlu port forwarding tambahan untuk dua ini — gunakan API IT Solution.

---

## Verifikasi Koneksi

### Script Test Cepat

```javascript
const net = require('net');

async function test(ip, port) {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    sock.setTimeout(3000);
    sock.on('connect', () => { sock.destroy(); resolve(true); });
    sock.on('error', () => { sock.destroy(); resolve(false); });
    sock.on('timeout', () => { sock.destroy(); resolve(false); });
    sock.connect(port, ip);
  });
}

(async () => {
  const machines = [
    ['10.0.0.232', 4370],
    ['103.144.228.42', 4700],
    ['103.144.211.226', 4370],
  ];
  
  for (const [ip, port] of machines) {
    const ok = await test(ip, port);
    console.log(`${ip}:${port} → ${ok ? '✅ OPEN' : '❌ CLOSED'}`);
  }
})();
```

---

## Tips

1. **Selalu disableDevice sebelum ambil data** — mencegah mesin lock/timeout
2. **Enable device setelah selesai** — mengembalikan fungsi normal
3. **Gunakan timeout >= 20000ms** untuk data besar
4. **Save data ke JSON dulu** sebelum insert ke database
5. **Batch insert** — jangan insert satu per satu jika data > 1000 records
6. **Gunakan unique constraint** untuk mencegah duplikat
