# Quick Fixes - Critical Issues

Generated: 2026-06-21

---

## Fix #1: Missing Icon Imports (2 min)

**File:** `frontend/src/components/features/attendance/AttendancePage.tsx`

**Add this line after existing lucide imports:**
```typescript
import { LogIn, LogOut, Activity, Fingerprint, X } from 'lucide-react';
```

---

## Fix #2: Store Unmapped Users (30 min)

**File:** `src/modules/import/sync-orchestrator.service.ts`

**Replace lines 315-324:**
```typescript
if (empCode) {
  await this.importAttendanceLog(batchId, machine, att, empCode.empCode);
  attCount++;
} else {
  // Store unmapped for analysis
  await this.storeUnmappedAttendance(batchId, machine, att);
  unmappedCount++;
}
```

**Add new method:**
```typescript
private async storeUnmappedAttendance(
  batchId: string,
  machine: Machine,
  att: ZKAttendance
): Promise<void> {
  await db.execute(
    `INSERT INTO attendance_scan_logs 
     (batch_id, machine_code, raw_device_user_id, scan_time, mapping_status, mapping_reason)
     VALUES (@batchId, @machineCode, @rawDeviceUserId, @scanTime, 'UNMAPPED', 'No mapping found')`,
    {
      batchId,
      machineCode: machine.machine_code,
      rawDeviceUserId: att.deviceUserId,
      scanTime: att.punchTime
    }
  );
}
```

---

## Fix #3: Install Notification Packages

```bash
npm install nodemailer twilio @types/nodemailer @types/twilio
```

**Create:** `src/services/notification/email.service.ts`
```typescript
import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
});

export async function sendEmail(to: string[], subject: string, body: string) {
  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: to.join(', '),
    subject,
    text: body,
  });
}
```

**Create:** `src/services/notification/sms.service.ts`
```typescript
import twilio from 'twilio';

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

export async function sendSMS(to: string[], message: string) {
  for (const recipient of to) {
    await client.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: recipient,
    });
  }
}
```

**Update:** `src/modules/monitoring/alert.service.ts`

Replace placeholder code in `sendEmail()`, `sendSMS()`, `sendWebhook()` methods.

---

## Fix #4: Hardcoded Dashboard Values

**File:** `src/api/routes/dashboard.routes.ts`

**Replace lines 43-44:**
```typescript
online_machines: (SELECT COUNT(*) FROM attendance_machines WHERE is_active=1 AND last_ping > DATEADD(minute, -30, GETDATE())),
offline_machines: (SELECT COUNT(*) FROM attendance_machines WHERE is_active=1 AND last_ping <= DATEADD(minute, -30, GETDATE())),
quality_score: (SELECT CAST(SUM(CASE WHEN mapping_status = 'MAPPED' THEN 1 ELSE 0 END) * 100.0 / COUNT(*) AS INT) FROM attendance_scan_logs WHERE scan_date = GETDATE()),
```

---

## Fix #5: Remove SQL Injection

**File:** `src/modules/employees/employee-movement.service.ts:64`

**Replace:**
```typescript
// BEFORE (vulnerable)
`WHERE employee_id = ${employeeId} AND effective_start <= '${date}'`

// AFTER (safe)
`WHERE employee_id = @employeeId AND effective_start <= @workDate`
// With parameters: { employeeId, workDate: formattedDate }
```

---

## Fix #6: Rebuild Source

```bash
npm run build
```

Verify `dist/api/routes/attendance.routes.js` matches expected behavior.

---

## .env Additions for Notifications

```env
# Email (SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=alerts@company.com
SMTP_PASSWORD=<app-password>
SMTP_FROM=Absensi Alerts <alerts@company.com>

# SMS (Twilio)
TWILIO_ACCOUNT_SID=<your-account-sid>
TWILIO_AUTH_TOKEN=<your-auth-token>
TWILIO_PHONE_NUMBER=+1234567890
```
