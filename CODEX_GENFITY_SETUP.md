# Codex + Genfity Proxy Setup

Codex CLI calls `/v1/responses` tapi Genfity hanya punya `/v1/chat/completions`.
Proxy ini translate Request API → Chat Completions dan return Anthropic SSE streaming.

## Start Proxy

```powershell
# Di PowerShell (1 baris):
powershell.exe -Command "Start-Process -FilePath 'node' -ArgumentList 'genfity-proxy.js' -WorkingDirectory 'D:\Gawean Rebinmas\Absensi_Muka'"

# Atau via CMD:
cmd.exe /c "cd /d D:\Gawean Rebinmas\Absensi_Muka && node genfity-proxy.js"
```

**Verifikasi proxy jalan:**
```bash
curl http://localhost:3010/health
# Should return: {"status":"ok","token_len":48}
```

## Stop Proxy

```powershell
taskkill //F //IM node.exe
```

## Codex Config

File: `C:\Users\nbgmf\.codex\config.toml`

```toml
model_provider = "genfity"
model = "gpt-5.5"
model_reasoning_effort = "xhigh"
disable_response_storage = true
network_access = "enabled"

[features]
goals = true

[model_providers.genfity]
name = "Genfity"
base_url = "http://localhost:3010/v1"
env_key = "GENFITY_KEY"
wire_api = "responses"

[projects."d:\\gawean rebinmas\\absensi_muka"]
trust_level = "trusted"

[projects.'c:\\users\\nbgmf']
trust_level = "trusted"

[tui.model_availability_nux]
"gpt-5.5" = 4

[windows]
sandbox = "elevated"
```

## Pakai Codex

```bash
# Basic
claude -p "task description" --add-dir "D:/Gawean Rebinmas/ProjectFolder"

# With model flag
claude -p "task" --add-dir "D:/Gawean Rebinmas/ProjectFolder" --model opus

# With output format
claude -p "task" --add-dir "D:/Gawean Rebinmas/ProjectFolder" --output-format json

# Interactive TUI
claude --attach
```

## Troubleshooting

### "Stream disconnected before completion"
1. Proxy mati → start ulang:
   ```powershell
   taskkill //F //IM node.exe
   powershell.exe -Command "Start-Process -FilePath 'node' -ArgumentList 'genfity-proxy.js' -WorkingDirectory 'D:\Gawean Rebinmas\Absensi_Muka'"
   sleep 2
   curl http://localhost:3010/health
   ```
2. Coba lagi

### "invalid_api_key"
- Token corrupt di environment
- Proxy baca dari file `.env-proxy` di folder Absensi_Muka
- Verifikasi: `curl http://localhost:3010/health` → `token_len` harus 48

### "Model metadata not found"
- Normal untuk model non-standard
- Tidak affect functionality

### Proxy tidak bisa start
- Port 3010 sudah dipake: ganti port di `genfity-proxy.js` line `const PORT = 3010`
- Update `config.toml` `base_url` port juga

## File Struktur

```
D:/Gawean Rebinmas/Absensi_Muka/
├── genfity-proxy.js    ← Proxy server (translate responses → chat)
└── .env-proxy          ← Token (di-load otomatis oleh proxy)
```

## API Key

Token ada di `.env-proxy`. Jika perlu regenerate:
1. Login https://ai.genfity.com
2. API Keys → Generate
3. Update `.env-proxy`: `GENFITY_KEY=your_new_key`
4. Restart proxy
