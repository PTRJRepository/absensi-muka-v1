# API Endpoints - Complete Reference

## Total: 123 endpoints across 22 route files

---

## Authentication

### POST /api/auth/login
**Login user**

Request:
```json
{
  "username": "admin",
  "password": "password123"
}
```

Response:
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGci...",
    "user": {
      "id": 1,
      "username": "admin",
      "role": "admin"
    }
  }
}
```

---

### POST /api/auth/logout
**Logout user**

Response:
```json
{ "success": true }
```

---

### GET /api/auth/me
**Get current user** (Protected)

Response:
```json
{
  "success": true,
  "data": {
    "id": 1,
    "username": "admin",
    "role": "admin"
  }
}
```

---

## Dashboard

### GET /api/dashboard/stats
**Get dashboard statistics**

Response:
```json
{
  "success": true,
  "data": {
    "total_machines": 16,
    "online_machines": 7,
    "total_employees": 450,
    "total_scans_today": 1234,
    "unmapped_count": 23,
    "quality_score": 92,
    "today_date": "2024-01-15",
    "last_sync": "2024-01-15T07:45:00Z"
  }
}
```

---

### GET /api/dashboard/summary
**Get daily summary**

Query Parameters:
- `date` (optional): YYYY-MM-DD

Response:
```json
{
  "success": true,
  "data": {
    "total_employee": 450,
    "present_today": 430,
    "absent_today": 15,
    "leave_or_sick": 5,
    "total_overtime": 25.5
  }
}
```

---

### GET /api/dashboard/division-summary
**Get division coverage summary**

Query Parameters:
- `date` (optional): YYYY-MM-DD

Response:
```json
{
  "success": true,
  "data": [
    {
      "division_code": "P1A",
      "total_employees": 50,
      "present": 48,
      "absent": 2,
      "coverage_percent": 96
    }
  ]
}
```

---

### GET /api/dashboard/sync-status
**Get latest sync status for all machines**

Response:
```json
{
  "success": true,
  "data": [
    {
      "machine_code": "P1A",
      "status": "COMPLETED",
      "started_at": "2024-01-15T07:00:00Z",
      "records_synced": 45
    }
  ]
}
```

---

## Machines

### GET /api/machines
**List all machines**

Response:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "machine_code": "P1A",
      "location_name": "P1A Main Gate",
      "ip_address": "192.168.1.10",
      "port": 4370,
      "is_active": true,
      "access_status": "ACCESSIBLE",
      "data_source": "DIRECT_ZKTECO",
      "loc_code": "A",
      "scan_count_today": 234,
      "user_count_today": 45,
      "quality_score": 92,
      "unmapped_count_7d": 5,
      "last_sync_at": "2024-01-15T07:00:00Z",
      "last_error_message": null
    }
  ]
}
```

---

### GET /api/machines/failures
**Get machine connection failures**

Response:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "machine_code": "P2A",
      "status": "FAILED",
      "error_message": "Connection refused",
      "checked_at": "2024-01-15T10:30:00Z"
    }
  ]
}
```

---

### POST /api/machines/:machineCode/test-connection
**Test machine connection** (IT_ADMIN, OPERATOR)

Response:
```json
{
  "success": true,
  "data": {
    "machine_code": "P1A",
    "connected": true,
    "response_time_ms": 150,
    "users_count": 45,
    "attendance_count": 128
  }
}
```

---

### GET /api/machines/real-time-status
**Get real-time machine status**

Response:
```json
{
  "success": true,
  "data": {
    "machines": [...],
    "summary": {
      "total": 16,
      "online": 7,
      "offline": 9,
      "total_scans_today": 1234
    }
  }
}
```

---

## Employees

### GET /api/employees
**List employees**

Query Parameters:
- `page` (optional): Page number
- `pageSize` (optional): Items per page (default 25, max 100)
- `search` (optional): Search by employee code or name
- `divisionCode` (optional): Filter by division

Response:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "employee_code": "A0044",
      "employee_name": "Budi Santoso",
      "division_code": "P1A",
      "gang_code": "G01",
      "is_active": true
    }
  ]
}
```

---

### GET /api/employees/:id
**Get employee by ID**

Response:
```json
{
  "success": true,
  "data": {
    "id": 1,
    "employee_code": "A0044",
    "employee_name": "Budi Santoso",
    "division_id": 1,
    "gang_id": 1,
    "is_active": true
  }
}
```

---

### POST /api/employees
**Create employee** (HR_ADMIN)

Request:
```json
{
  "employeeCode": "A0050",
  "employeeName": "John Doe",
  "divisionCode": "P1A",
  "gangCode": "G01",
  "isActive": true
}
```

Response:
```json
{ "success": true, "data": { "created": true } }
```

---

### PUT /api/employees/:id
**Update employee** (HR_ADMIN)

Request:
```json
{
  "employeeCode": "A0050",
  "employeeName": "John Doe Updated",
  "divisionCode": "P1A",
  "gangCode": "G02",
  "isActive": true
}
```

Response:
```json
{ "success": true, "data": { "updated": true } }
```

---

### DELETE /api/employees/:id
**Delete employee** (HR_ADMIN)

Response:
```json
{ "success": true, "data": { "deleted": true } }
```

---

## Attendance

### GET /api/attendance/daily
**Get daily attendance**

Query Parameters:
- `date` (required): YYYY-MM-DD
- `divisionCode` (optional)
- `gangCode` (optional)
- `search` (optional): Search by employee code or name
- `page` (optional): Page number
- `pageSize` (optional): Items per page (default 50, max 200)

Response:
```json
{
  "success": true,
  "data": [
    {
      "employee_code": "A0044",
      "employee_name": "Budi Santoso",
      "division_code": "P1A",
      "gang_code": "G01",
      "attendance_date": "2024-01-15",
      "attendance_status": "HADIR",
      "check_in_at": "07:30:00",
      "check_out_at": "17:00:00",
      "source": "ZKTECO",
      "is_leave": 0,
      "is_sick": 0,
      "is_holiday": 0,
      "overtime_hours": 0.5
    }
  ]
}
```

---

### GET /api/attendance/monthly
**Get monthly attendance summary**

Query Parameters:
- `year` (required): YYYY
- `month` (required): 1-12
- `divisionCode` (optional)

Response:
```json
{
  "success": true,
  "data": [
    {
      "employee_code": "A0044",
      "employee_name": "Budi Santoso",
      "division_code": "P1A",
      "total_days": 22,
      "hadir": 20,
      "tidak_hadir": 2,
      "sick": 1,
      "leave": 1
    }
  ]
}
```

---

### GET /api/attendance/monthly-matrix
**Get monthly attendance matrix** (dual mode: database or datamesin)

Query Parameters:
- `year` (required): YYYY
- `month` (required): 1-12
- `divisionCode` (optional)
- `machineCode` (optional)
- `status` (optional): HADIR, TIDAK_HADIR, SAKIT, CUTI, HOLIDAY
- `mapping` (optional): MAPPED, UNMAPPED
- `source` (optional): ZKTECO, DIRECT_ZKTECO
- `mode` (optional): database (default), datamesin
- `activeOnly` (optional): true/false (default true)
- `search` (optional): Search term
- `page` (optional): Page number
- `pageSize` (optional): Max rows (default 100, max 500)

Response:
```json
{
  "success": true,
  "data": {
    "rows": [...],
    "pagination": {
      "page": 1,
      "pageSize": 100,
      "total": 450,
      "totalPages": 5
    }
  },
  "meta": {
    "source": "final_attendance_matrix",
    "mode": "database",
    "period": "2024-01"
  }
}
```

---

### GET /api/attendance/monthly-matrix-traceable
**Get traceable monthly matrix with full provenance**

Query Parameters:
- `year` (required): YYYY
- `month` (required): 1-12
- `divisionCode` (optional)
- `machineCode` (optional)
- `status` (optional): Filter by final status
- `mapping` (optional): MAPPED, UNMAPPED
- `source` (optional): Filter by source
- `activeOnly` (optional): true/false
- `search` (optional): Search term
- `page` (optional): Page number
- `pageSize` (optional): Max rows

Response includes enriched data with:
- `final_status`: Computed final status
- `source`: Data source (MANUAL_CORRECTION, IMPORTED, ZKTECO, NO_DATA)
- `expected_status`: WORKDAY, HOLIDAY, OFF_DAY
- `has_raw_scan`, `has_import`, `has_manual_correction`: Boolean flags
- `provenance`: JSON with source chain
- `quality_flags`: Array of quality issues
- `reason`: Human-readable explanation

---

### GET /api/attendance/monthly-matrix/cell
**Get detailed cell data for specific employee and date**

Query Parameters:
- `date` (required): YYYY-MM-DD
- `employeeCode` (optional)
- `rawDeviceUserId` (optional)
- `machineCode` (optional)

Response:
```json
{
  "success": true,
  "data": {
    "employee": { "employee_code": "A0044", "employee_name": "Budi", "division_code": "P1A" },
    "date": "2024-01-15",
    "final_status": "HADIR",
    "source": "ZKTECO",
    "expected_status": "WORKDAY",
    "holiday_name": null,
    "workday_label": "Monday",
    "trace_state": "RAW_ONLY",
    "provenance": "{\"source_chain\":[\"RAW_SCAN\"],\"has_raw_scan\":true,...}",
    "reason": "Raw scan valid",
    "check_in_at": "07:30:00",
    "check_out_at": "17:00:00",
    "raw_logs": [...],
    "correction": null,
    "imported": null,
    "quality_flags": []
  }
}
```

---

### GET /api/attendance/available-months
**Get available months with attendance data**

Response:
```json
{
  "success": true,
  "data": [
    { "attendance_year": 2024, "attendance_month": 1 },
    { "attendance_year": 2023, "attendance_month": 12 }
  ]
}
```

---

### GET /api/attendance/summary
**Get daily attendance summary by division**

Query Parameters:
- `date` (optional): YYYY-MM-DD

Response:
```json
{
  "success": true,
  "data": [
    {
      "division_code": "P1A",
      "total_employees": 50,
      "total_present": 48,
      "total_absent": 2,
      "total_leave": 0,
      "total_sick": 0,
      "total_overtime_hours": 5.5
    }
  ]
}
```

---

### GET /api/attendance/employee/:employeeCode
**Get employee attendance history**

Query Parameters:
- `startDate` (optional): YYYY-MM-DD
- `endDate` (optional): YYYY-MM-DD

Response:
```json
{
  "success": true,
  "data": [
    {
      "employee_code": "A0044",
      "employee_name": "Budi Santoso",
      "attendance_date": "2024-01-15",
      "attendance_status": "HADIR",
      "check_in_at": "07:30:00",
      "check_out_at": "17:00:00",
      "source": "ZKTECO",
      "is_leave": 0,
      "is_sick": 0,
      "is_holiday": 0,
      "overtime_hours": 0.5
    }
  ]
}
```

---

### GET /api/attendance/employee/:employeeCode/raw
**Get raw scan logs for employee**

Query Parameters:
- `limit` (optional): Max records (default 200, max 500)

Response:
```json
{
  "success": true,
  "data": [
    {
      "scan_log_id": 1,
      "scan_date": "2024-01-15",
      "scan_time": "07:30:00",
      "raw_device_user_id": "10044",
      "machine_code": "P1A",
      "parsed_employee_code": "A0044",
      "source": "ZKTECO",
      "mapping_status": "MAPPED",
      "scan_direction": "IN"
    }
  ]
}
```

---

### GET /api/attendance/corrections
**Get manual corrections list**

Response:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "employee_code": "A0044",
      "attendance_date": "2024-01-15",
      "attendance_status": "HADIR",
      "check_in_at": "08:00:00",
      "check_out_at": "17:30:00",
      "reason": "Terlambat karena macet",
      "created_by": 1
    }
  ]
}
```

---

### POST /api/attendance/corrections
**Create manual correction** (HR_ADMIN)

Request:
```json
{
  "employeeCode": "A0044",
  "attendanceDate": "2024-01-15",
  "attendanceStatus": "HADIR",
  "checkInAt": "08:00:00",
  "checkOutAt": "17:30:00",
  "hasWork": true,
  "isLeave": false,
  "isSick": false,
  "isHoliday": false,
  "overtimeHours": 0,
  "reason": "Terlambat karena macet"
}
```

Response:
```json
{ "success": true, "data": { "created": true } }
```

---

### PUT /api/attendance/corrections/:id
**Update manual correction** (HR_ADMIN)

Request: Same as POST

Response:
```json
{ "success": true, "data": { "updated": true } }
```

---

### DELETE /api/attendance/corrections/:id
**Delete manual correction** (HR_ADMIN)

Response:
```json
{ "success": true, "data": { "deleted": true } }
```

---

### GET /api/attendance/import-count
**Get import processing counts**

Response:
```json
{
  "success": true,
  "data": {
    "attendanceImports": 45000,
    "attendanceScanLogs": 50000,
    "manualReviewImports": 500,
    "pending": 5000
  }
}
```

---

### POST /api/attendance/process-scan-logs
**Process scan logs for a batch**

Query Parameters:
- `batchId` (optional): Specific batch ID

Response:
```json
{
  "success": true,
  "data": {
    "processed": 100,
    "success": 98,
    "failed": 2
  }
}
```

---

### POST /api/attendance/process-all-scan-logs
**Process all unprocessed scan logs**

Query Parameters:
- `batchSize` (optional): Batch size (default 1000)

Response:
```json
{
  "success": true,
  "data": {
    "total": 5000,
    "processed": 5000,
    "success": 4950,
    "failed": 50
  }
}
```

---

## Divisions

### GET /api/divisions
**List all divisions**

Response:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "division_code": "P1A",
      "division_name": "P1A Division",
      "is_active": true,
      "total_employees": 50,
      "active_employees": 48,
      "inactive_employees": 2
    }
  ]
}
```

---

### GET /api/divisions/compare
**Compare multiple divisions**

Query Parameters:
- `divisions` (required): Comma-separated division codes
- `year` (optional): YYYY (default: current year)
- `month` (optional): 1-12 (default: current month)

Response:
```json
{
  "success": true,
  "data": {
    "year": 2024,
    "month": 1,
    "divisions": ["P1A", "P1B"],
    "comparison": [
      {
        "division_code": "P1A",
        "division_name": "P1A Division",
        "total_records": 1000,
        "unique_employees": 50,
        "hadir": 900,
        "tidak_hadir": 50,
        "sick": 10,
        "leave": 15,
        "days_worked": 22,
        "hadir_rate": 90,
        "rank": 1
      }
    ],
    "daily_trend": [...]
  }
}
```

---

### GET /api/divisions/:code
**Get division detail with employee summary**

Response:
```json
{
  "success": true,
  "data": {
    "id": 1,
    "division_code": "P1A",
    "division_name": "P1A Division",
    "employee_count": 50,
    "active_employees": 48,
    "inactive_employees": 2,
    "machines_active": 1
  }
}
```

---

### GET /api/divisions/:code/attendance
**Get division attendance for month**

Query Parameters:
- `year` (optional): YYYY
- `month` (optional): 1-12

Response:
```json
{
  "success": true,
  "data": {
    "division": { "division_code": "P1A", "division_name": "P1A Division" },
    "year": 2024,
    "month": 1,
    "summary": {
      "total_records": 1000,
      "unique_employees": 50,
      "hadir": 900,
      "tidak_hadir": 50,
      "sick": 10,
      "leave": 15,
      "holiday": 5,
      "days_worked": 22,
      "hadir_rate": 90
    },
    "by_date": [...],
    "by_employee": [...],
    "by_status": [...]
  }
}
```

---

### GET /api/divisions/:code/machines
**Get division machine activity**

Response:
```json
{
  "success": true,
  "data": {
    "division_code": "P1A",
    "machine_count": 1,
    "machines": [
      {
        "machine_code": "P1A",
        "location_name": "P1A Main Gate",
        "ip_address": "192.168.1.10",
        "scan_count": 5000,
        "unique_employees": 45,
        "last_scan": "2024-01-15T17:00:00Z"
      }
    ]
  }
}
```

---

### GET /api/divisions/:code/scans
**Get division raw scan logs**

Query Parameters:
- `page` (optional): Page number
- `limit` (optional): Items per page (default 50)
- `days` (optional): Days to look back (default 7)

Response:
```json
{
  "success": true,
  "data": {
    "division_code": "P1A",
    "period_days": 7,
    "records": [...],
    "pagination": {
      "page": 1,
      "limit": 50,
      "total": 500,
      "totalPages": 10
    }
  }
}
```

---

## Quality

### GET /api/quality/summary
**Get quality metrics summary**

Query Parameters:
- `days` (optional): Period in days (default 7)

Response:
```json
{
  "success": true,
  "data": {
    "period_days": 7,
    "total_scans": 5000,
    "mapped_employees": 427,
    "unmapped_codes": 23,
    "failed_batches": 2,
    "completed_batches": 45,
    "status": "WARNING",
    "overall_status": "warning",
    "score": 85,
    "metrics": [
      { "name": "Karyawan Terpetakan", "status": "healthy", "value": 427 },
      { "name": "Kode Tidak Terpetakan", "status": "warning", "value": 23 },
      { "name": "Batch Gagal", "status": "critical", "value": 2 }
    ],
    "summary": {
      "healthy_count": 427,
      "warning_count": 2,
      "critical_count": 23
    }
  }
}
```

---

### GET /api/quality/dashboard-summary
**Get quality dashboard summary** (alternate version)

Query Parameters:
- `days` (optional): Period in days (default 30)

Response:
```json
{
  "success": true,
  "data": {
    "period_days": 30,
    "since": "2023-12-16",
    "summary": {
      "total_scan_logs": 15000,
      "total_imports": 12000,
      "unmapped_count": 150,
      "mapped_count": 12000,
      "mapped_rate": 89,
      "failed_batches": 5
    },
    "daily_trend": [...],
    "top_issues": [...]
  }
}
```

---

### GET /api/quality/daily-trend
**Get daily trend data** (alternate version)

Query Parameters:
- `days` (optional): Period in days (default 30)
- `division` (optional): Filter by division

Response:
```json
{
  "success": true,
  "data": {
    "period_days": 30,
    "since": "2023-12-16",
    "division_filter": null,
    "daily_trend": [
      {
        "date": "2024-01-15",
        "record_count": 500,
        "unique_employees": 45,
        "mapped_count": 480,
        "unmapped_count": 20
      }
    ],
    "by_division": [...]
  }
}
```

---

### GET /api/quality/unmapped
**Get unmapped employees**

Query Parameters:
- `days` (optional): Period in days (default 30)
- `machine` (optional): Filter by machine code

Response:
```json
{
  "success": true,
  "data": {
    "period_days": 30,
    "machine_filter": null,
    "total_unmapped": 23,
    "breakdown": {
      "invalid_format": 5,
      "no_employee_found": 15,
      "pending_override": 3
    },
    "items": [
      {
        "raw_device_user_id": "10099",
        "occurrence_count": 50,
        "machines": "P1A, P1B",
        "last_seen": "2024-01-15T07:30:00Z",
        "first_seen": "2024-01-01T08:00:00Z",
        "mapping_status": "NO_EMPLOYEE_FOUND"
      }
    ]
  }
}
```

---

### GET /api/quality/duplicates
**Get duplicate scan records**

Query Parameters:
- `machine` (optional): Filter by machine
- `days` (optional): Period in days (default 30)

Response:
```json
{
  "success": true,
  "data": {
    "period_days": 30,
    "machine_filter": null,
    "duplicate_groups": 15,
    "extra_records": 25,
    "items": [
      {
        "raw_device_user_id": "10044",
        "machine_code": "P1A",
        "scan_date": "2024-01-15",
        "scan_count": 3,
        "first_scan": "07:30:00",
        "last_scan": "17:00:00",
        "all_times": "07:30:00, 12:00:00, 17:00:00"
      }
    ]
  }
}
```

---

### GET /api/quality/machine-drift
**Get machine time drift analysis**

Query Parameters:
- `threshold` (optional): Threshold in seconds (default 300)

Response:
```json
{
  "success": true,
  "data": {
    "threshold_seconds": 300,
    "total_machines": 16,
    "synced_machines": 14,
    "drifted_machines": 2,
    "items": [
      {
        "machine_code": "P2A",
        "location_name": "P2A Gate",
        "ip_address": "192.168.2.10",
        "access_status": "ACCESSIBLE",
        "last_sync_at": "2024-01-15T07:00:00Z",
        "drift_seconds": 600,
        "is_within_tolerance": false,
        "status": "DRIFTED"
      }
    ]
  }
}
```

---

### GET /api/quality/report
**Get comprehensive quality report**

Query Parameters:
- `days` (optional): Period in days (default 30)

Response:
```json
{
  "success": true,
  "data": {
    "period_days": 30,
    "since": "2023-12-16",
    "summary": {
      "total_scan_logs": 15000,
      "total_imports": 12000,
      "unmapped_count": 150,
      "mapped_count": 12000,
      "mapped_rate": 89
    },
    "daily_trend": [...],
    "by_division": [...],
    "unmapped_codes": [...],
    "batch_summary": [...]
  }
}
```

---

## Monitoring

### GET /api/monitoring/dashboard
**Get monitoring dashboard summary**

Response:
```json
{
  "success": true,
  "data": {
    "totalMachines": 16,
    "accessibleMachines": 7,
    "offlineMachines": 9,
    "ztkeoMachines": 7,
    "todayTotalScans": 1234,
    "todayUniqueEmployees": 450,
    "pendingBatches": 2,
    "lastBatch": {
      "id": 123,
      "batchCode": "SYNC_20240115_001",
      "status": "COMPLETED",
      "recordsTotal": 45,
      "recordsSuccess": 43,
      "recordsFailed": 2
    }
  }
}
```

---

### GET /api/monitoring/machines
**List all monitoring-enabled machines**

Response:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "machine_code": "P1A",
      "machine_name": "P1A Main Gate",
      "ip_address": "192.168.1.10",
      "port": 4370,
      "access_status": "ACCESSIBLE",
      "data_source": "DIRECT_ZKTECO",
      "loc_code": "A",
      "records_today": 234,
      "employees_today": 45
    }
  ]
}
```

---

### GET /api/monitoring/machine/:code
**Get detailed machine information**

Response:
```json
{
  "success": true,
  "data": {
    "machine": {...},
    "ping_status": "HEALTHY",
    "todayStats": {
      "total_scans": 234,
      "unique_employees": 45,
      "first_scan": "07:00:00",
      "last_scan": "17:30:00"
    },
    "recentSyncs": [...],
    "recentBatches": [...],
    "monthlyStats": [...],
    "device_users": {
      "summary": { "total": 50, "mapped": 45, "unmapped": 5 },
      "mapped_users": [...],
      "unmapped_users": [...]
    }
  }
}
```

---

### GET /api/monitoring/batches
**Get batch history**

Query Parameters:
- `page` (optional): Page number
- `limit` (optional): Items per page (default 20)
- `machine` (optional): Filter by machine code
- `status` (optional): COMPLETED, FAILED, RUNNING
- `dateFrom` (optional): Start date
- `dateTo` (optional): End date

Response:
```json
{
  "success": true,
  "data": {
    "batches": [
      {
        "id": 1,
        "batch_code": "SYNC_20240115_001",
        "machine_code": "P1A",
        "status": "COMPLETED",
        "records_total": 45,
        "records_success": 43,
        "records_failed": 2,
        "started_at": "2024-01-15T07:00:00Z",
        "finished_at": "2024-01-15T07:02:30Z"
      }
    ],
    "pagination": { "page": 1, "limit": 20, "total": 150, "totalPages": 8 }
  }
}
```

---

### GET /api/monitoring/batch/:id
**Get batch detail with sample logs**

Response:
```json
{
  "success": true,
  "data": {
    "batch": {
      "id": 1,
      "batch_code": "SYNC_20240115_001",
      "machine_code": "P1A",
      "status": "COMPLETED",
      "records_total": 45,
      "records_success": 43,
      "records_failed": 2
    },
    "sampleLogs": [...]
  }
}
```

---

### GET /api/monitoring/batch/:id/logs
**Get paginated logs for a batch**

Query Parameters:
- `page` (optional): Page number
- `limit` (optional): Items per page (default 50, max 200)

Response:
```json
{
  "success": true,
  "data": {
    "logs": [...],
    "pagination": {
      "page": 1,
      "limit": 50,
      "total": 500,
      "totalPages": 10
    }
  }
}
```

---

### POST /api/monitoring/batch/:id/retry
**Retry failed records in a batch**

Response:
```json
{
  "success": true,
  "data": {
    "retried": 5,
    "newBatchCode": "RETRY_1705312345678",
    "machines": ["P1A"],
    "message": "Retry job started for 5 records"
  }
}
```

---

### GET /api/monitoring/batch/:id/status
**Get current status of a batch**

Response:
```json
{
  "success": true,
  "data": {
    "id": 1,
    "batch_code": "SYNC_20240115_001",
    "machine_code": "P1A",
    "machine_name": "P1A Main Gate",
    "status": "COMPLETED",
    "records_total": 45,
    "records_success": 43,
    "records_failed": 2,
    "started_at": "2024-01-15T07:00:00Z",
    "finished_at": "2024-01-15T07:02:30Z"
  }
}
```

---

### GET /api/monitoring/quality
**Get data quality metrics**

Query Parameters:
- `days` (optional): Period in days (default 30)

Response:
```json
{
  "success": true,
  "data": {
    "totalScanLogs": 15000,
    "totalImported": 12000,
    "unmappedCount": 150,
    "mappedCount": 12000,
    "mappedRate": 89,
    "needReviewCount": 150,
    "dailyTrend": [...],
    "recordsPerDivision": [...],
    "unmappedCodes": [...]
  }
}
```

---

### GET /api/monitoring/division-summary
**Get monthly division attendance summary**

Query Parameters:
- `year` (optional): YYYY
- `month` (optional): 1-12

Response:
```json
{
  "success": true,
  "data": {
    "year": 2024,
    "month": 1,
    "divisions": [
      {
        "division_code": "P1A",
        "total_records": 1000,
        "unique_employees": 50,
        "hadir": 900,
        "tidak_hadir": 50,
        "sick": 10,
        "leave": 15,
        "holiday": 5
      }
    ]
  }
}
```

---

## Machine Employee Routes

### POST /api/monitoring/machine-ping
**Ping all active machines** (IT_ADMIN, OPERATOR)

Query Parameters:
- `machine` (optional): Specific machine code

Response:
```json
{
  "success": true,
  "data": [
    {
      "machine_code": "P1A",
      "ip": "192.168.1.10",
      "port": 4370,
      "reachable": true,
      "latency_ms": 45,
      "status": "ONLINE"
    }
  ]
}
```

---

### GET /api/monitoring/machine/:code/employees
**Get machine employees (dual mode: raw vs database)**

Response:
```json
{
  "success": true,
  "data": {
    "machine": { "id": 1, "machine_code": "P1A", "location_name": "P1A Main Gate" },
    "summary": {
      "total_unique_ids": 50,
      "mapped_count": 45,
      "unmapped_count": 5,
      "db_employees_seen": 42
    },
    "machine_raw": [...],
    "database_mapped": [...],
    "unmapped": [...],
    "db_employees": [...]
  }
}
```

---

### GET /api/monitoring/machine/:code/raw-data
**Get raw scan logs for machine**

Query Parameters:
- `page` (optional): Page number
- `limit` (optional): Items per page (default 50)
- `filter` (optional): all, mapped, unmapped

Response:
```json
{
  "success": true,
  "data": {
    "machine_code": "P1A",
    "filter": "all",
    "records": [...],
    "pagination": {
      "page": 1,
      "limit": 50,
      "total": 500,
      "totalPages": 10
    }
  }
}
```

---

### POST /api/monitoring/employees/:code/map
**Manual map raw_id to employee_code** (HR_ADMIN, IT_ADMIN)

Request:
```json
{
  "raw_id": "10044",
  "machine_code": "P1A"
}
```

Response:
```json
{
  "success": true,
  "data": {
    "employee_code": "A0044",
    "raw_id": "10044",
    "machine_code": "P1A",
    "updated_records": 15,
    "message": "Mapping applied and existing records updated"
  }
}
```

---

## Cross-Location Monitoring

### GET /api/monitoring/cross-location
**Get cross-location summary for all machines**

Query Parameters:
- `days` (optional): Number of days to analyze (default: 7)

Response:
```json
{
  "success": true,
  "data": {
    "period": "Last 7 days",
    "machines": [
      {
        "machineCode": "P1B",
        "expectedPrefix": "B",
        "expectedDivision": "P1B",
        "uniquePrefixes": ["B", "C"],
        "isMixed": true,
        "crossLocationCount": 1,
        "status": "WARNING"
      }
    ],
    "totalMachines": 16,
    "mixedMachines": 3,
    "cleanMachines": 13
  }
}
```

---

### GET /api/monitoring/cross-location/:machineCode
**Get detailed cross-location employees for a machine**

Query Parameters:
- `days` (optional): Number of days (default: 7)
- `limit` (optional): Max employees to return (default: 100)

Response:
```json
{
  "success": true,
  "data": {
    "machine": {
      "code": "P1B",
      "expectedPrefix": "B",
      "expectedDivision": "P1B"
    },
    "summary": {
      "totalEmployees": 50,
      "correctEmployees": 42,
      "crossLocationEmployees": 8
    },
    "crossLocationEmployees": [
      {
        "employeeCode": "C50001",
        "employeeName": "HADI",
        "homeDivision": "P2A",
        "totalScans": 25
      }
    ]
  }
}
```

---

### GET /api/monitoring/cross-location/report
**Generate detailed cross-location report**

Query Parameters:
- `startDate` (optional): Start date (YYYY-MM-DD)
- `endDate` (optional): End date (YYYY-MM-DD)

Response:
```json
{
  "success": true,
  "data": {
    "period": "Last 30 days",
    "totalCrossLocationRecords": 45,
    "employees": [...],
    "recommendations": [
      "Review and clean ZKTeco machine enrollment"
    ]
  }
}
```

---

## Sync Control

### POST /api/monitoring/sync/:machineCode/ping
**Ping machine via TCP connection**

Response:
```json
{
  "success": true,
  "data": {
    "machine_code": "P1A",
    "ip": "192.168.1.10",
    "port": 4370,
    "reachable": true,
    "latency_ms": 45,
    "status": "OK"
  }
}
```

---

### POST /api/monitoring/sync/:machineCode
**Trigger sync for specific machine**

Response:
```json
{
  "success": true,
  "data": {
    "machine_code": "P1A",
    "batch_code": "P1A-2024-01-15T07-00-00",
    "status": "RUNNING",
    "message": "Sync started. Check /api/monitoring/batches for batch progress."
  }
}
```

---

### POST /api/monitoring/sync-all
**Trigger sync for all active machines**

Response:
```json
{
  "success": true,
  "data": {
    "triggered": 7,
    "errors": 0,
    "batches": [
      { "machine_code": "P1A", "batch_code": "P1A-xxx", "status": "TRIGGERED" }
    ],
    "errors_detail": []
  }
}
```

---

### GET /api/monitoring/sync-status/:id
**Check batch status**

Response:
```json
{
  "success": true,
  "data": {
    "id": 123,
    "batch_code": "SYNC_20240115_001",
    "machine_code": "P1A",
    "ip": "192.168.1.10",
    "status": "COMPLETED",
    "records_total": 45,
    "records_success": 43,
    "records_failed": 2,
    "started_at": "2024-01-15T07:00:00Z",
    "finished_at": "2024-01-15T07:02:30Z",
    "error_message": null
  }
}
```

---

## Scheduler

### GET /api/scheduler/jobs
**Get all scheduled jobs**

Response:
```json
{
  "success": true,
  "data": {
    "jobs": [
      {
        "name": "morning-sync",
        "machines": ["P1A", "P1B"],
        "intervalMinutes": 60,
        "enabled": true,
        "lastRun": {
          "batchCode": "SCHED_xxx",
          "status": "COMPLETED",
          "startedAt": "2024-01-15T07:00:00Z",
          "finishedAt": "2024-01-15T07:02:30Z",
          "recordsSuccess": 45,
          "recordsFailed": 2
        },
        "nextRun": "2024-01-15T08:00:00Z"
      }
    ],
    "globalEnabled": true,
    "globalInterval": 60,
    "globalMachines": []
  }
}
```

---

### POST /api/scheduler/jobs
**Create scheduled job** (IT_ADMIN, OPERATOR)

Request:
```json
{
  "name": "morning-sync",
  "machines": ["P1A", "P1B"],
  "intervalMinutes": 60,
  "enabled": true
}
```

Response:
```json
{
  "success": true,
  "data": {
    "job": { "name": "morning-sync", ... },
    "message": "Job \"morning-sync\" created"
  }
}
```

---

### PUT /api/scheduler/jobs/:name
**Update scheduled job**

Request:
```json
{
  "machines": ["P1A"],
  "intervalMinutes": 30,
  "enabled": false
}
```

Response:
```json
{
  "success": true,
  "data": {
    "job": { "name": "morning-sync", ... },
    "message": "Job \"morning-sync\" updated"
  }
}
```

---

### DELETE /api/scheduler/jobs/:name
**Delete scheduled job**

Response:
```json
{
  "success": true,
  "data": {
    "job": { "name": "morning-sync" },
    "message": "Job \"morning-sync\" deleted"
  }
}
```

---

### POST /api/scheduler/jobs/:name/run
**Run scheduled job immediately** (IT_ADMIN, OPERATOR)

Response:
```json
{
  "success": true,
  "data": {
    "jobName": "morning-sync",
    "batchCode": "SCHED_1705312345678_MORNING_SYNC",
    "status": "STARTED",
    "machines": ["P1A", "P1B"],
    "message": "Job \"morning-sync\" started as batch SCHED_xxx"
  }
}
```

---

### GET /api/scheduler/status
**Get scheduler status**

Response:
```json
{
  "success": true,
  "data": {
    "enabled": true,
    "interval_minutes": 60,
    "running_jobs": ["morning-sync", "evening-sync"],
    "next_scheduled_run": "2024-01-15T08:00:00Z",
    "status": "IDLE"
  }
}
```

---

### PUT /api/scheduler/config
**Update scheduler configuration**

Request:
```json
{
  "enabled": true,
  "intervalMinutes": 30,
  "machines": ["P1A", "P1B", "P2A"]
}
```

Response:
```json
{
  "success": true,
  "data": {
    "config": { "enabled": true, "intervalMinutes": 30, ... },
    "message": "Scheduler config updated"
  }
}
```

---

### POST /api/scheduler/sync-all
**Trigger manual sync for all machines** (IT_ADMIN, OPERATOR)

Response:
```json
{
  "success": true,
  "data": {
    "batchCode": "MANUAL_1705312345678",
    "status": "STARTED",
    "message": "Full sync started for all machines"
  }
}
```

---

### POST /api/scheduler/sync/:machineCode
**Trigger manual sync for specific machine** (IT_ADMIN, OPERATOR)

Response:
```json
{
  "success": true,
  "data": {
    "batchCode": "MANUAL_1705312345678_P1A",
    "machineCode": "P1A",
    "status": "STARTED",
    "message": "Sync started for P1A"
  }
}
```

---

## Import Control

### POST /api/import/trigger
**Trigger sync for machines**

Request:
```json
{
  "machineCode": "P1A",
  "force": false
}
```

Response:
```json
{
  "success": true,
  "data": {
    "jobId": "SYNC_1705312345678_ABC123",
    "status": "STARTED",
    "machines": ["P1A"],
    "message": "Sync job SYNC_xxx started for 1 machine(s)",
    "pid": 12345
  }
}
```

---

### GET /api/import/schedule
**Get schedule configuration**

Response:
```json
{
  "success": true,
  "data": {
    "config": {
      "enabled": true,
      "intervalMinutes": 60,
      "machines": [],
      "jobs": [...]
    },
    "runningJobs": [...]
  }
}
```

---

### PUT /api/import/schedule
**Update schedule configuration**

Request:
```json
{
  "enabled": true,
  "intervalMinutes": 30,
  "machines": ["P1A", "P1B"]
}
```

Response:
```json
{
  "success": true,
  "data": {
    "config": { ... },
    "message": "Schedule configuration updated"
  }
}
```

---

### GET /api/import/formats
**Get supported import formats**

Response:
```json
{
  "success": true,
  "data": [
    {
      "id": "ZKTECO_CSV",
      "name": "ZKTeco CSV",
      "description": "Comma-separated values export from ZKTeco software",
      "extensions": [".csv"],
      "example": "SN,Date,Time,ID,Name,Department,Card,VerifyMode,InOutMode"
    },
    {
      "id": "ZKTECO_DAT",
      "name": "ZKTeco DAT",
      "description": "Tab or space-separated export format",
      "extensions": [".dat", ".txt"]
    },
    {
      "id": "ZKTECO_XML",
      "name": "ZKTeco XML",
      "description": "XML export format",
      "extensions": [".xml"]
    }
  ]
}
```

---

### POST /api/import/preview
**Preview import file before committing**

Request:
```json
{
  "content": "SN,Date,Time,ID,Name,Department...",
  "fileName": "attendance.csv",
  "machineCode": "P1A"
}
```

Response:
```json
{
  "success": true,
  "data": {
    "totalRecords": 100,
    "validRecords": 98,
    "invalidRecords": 2,
    "preview": [...]
  }
}
```

---

### POST /api/import/upload
**Import file content**

Request:
```json
{
  "content": "SN,Date,Time,ID,Name,Department...",
  "fileName": "attendance.csv",
  "machineCode": "P1A",
  "importedBy": "admin"
}
```

Response:
```json
{
  "success": true,
  "data": {
    "recordsImported": 98,
    "errors": [...],
    "warnings": [...]
  }
}
```

---

## Alerts

### GET /api/alerts/rules
**Get alert rules**

Response:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "ALERT:High Unmapped Employees",
      "checkType": "UNMAPPED_EMPLOYEES",
      "condition": "GT",
      "threshold": 50,
      "severity": "WARNING",
      "channels": ["DASHBOARD"],
      "enabled": true
    }
  ]
}
```

---

### POST /api/alerts/rules
**Create alert rule**

Request:
```json
{
  "name": "High Duplicate Scans",
  "checkType": "DUPLICATE_SCANS",
  "condition": "GT",
  "threshold": 500,
  "severity": "WARNING",
  "channels": ["DASHBOARD", "EMAIL"],
  "recipients": ["admin@company.com"],
  "enabled": true
}
```

Response:
```json
{
  "success": true,
  "data": { "id": 1705312345678 }
}
```

---

### PUT /api/alerts/rules/:id
**Update alert rule**

Request: Same as POST

Response:
```json
{
  "success": true,
  "message": "Rule updated"
}
```

---

### DELETE /api/alerts/rules/:id
**Delete alert rule**

Response:
```json
{
  "success": true,
  "message": "Rule disabled"
}
```

---

### POST /api/alerts/run
**Run alert checks manually**

Response:
```json
{
  "success": true,
  "data": {
    "alertsTriggered": 1,
    "alerts": [
      { "title": "Warning: High Unmapped Employees", "severity": "WARNING", "message": "150 unmapped employees found" }
    ]
  }
}
```

---

### GET /api/alerts/history
**Get alert history**

Query Parameters:
- `limit` (optional): Max records (default 100)

Response:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "title": "LOG:High Unmapped",
      "message": "150 unmapped employees",
      "severity": "WARNING",
      "createdAt": "2024-01-15T10:00:00Z"
    }
  ]
}
```

---

### GET /api/alerts/active
**Get active alerts (last 24 hours)**

Response:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "title": "LOG:High Unmapped",
      "message": "150 unmapped employees",
      "severity": "WARNING",
      "createdAt": "2024-01-15T10:00:00Z"
    }
  ]
}
```

---

### GET /api/alerts/defaults
**Get default alert rules**

Response:
```json
{
  "success": true,
  "data": [
    { "name": "High Unmapped Employees", "checkType": "UNMAPPED_EMPLOYEES", "condition": "GT", "threshold": 50, "severity": "WARNING", "channels": ["DASHBOARD"], "enabled": true },
    { "name": "Critical Unmapped Employees", "checkType": "UNMAPPED_EMPLOYEES", "condition": "GT", "threshold": 200, "severity": "CRITICAL", "channels": ["DASHBOARD"], "enabled": true },
    { "name": "High Duplicate Scans", "checkType": "DUPLICATE_SCANS", "condition": "GT", "threshold": 500, "severity": "WARNING", "channels": ["DASHBOARD"], "enabled": true },
    { "name": "Unprocessed Logs Backlog", "checkType": "UNPROCESSED_LOGS", "condition": "GT", "threshold": 5000, "severity": "CRITICAL", "channels": ["DASHBOARD"], "enabled": true },
    { "name": "Machine Time Drift", "checkType": "MACHINE_TIME_DRIFT", "condition": "GT", "threshold": 0, "severity": "WARNING", "channels": ["DASHBOARD"], "enabled": true }
  ]
}
```

---

### POST /api/alerts/defaults/seed
**Seed default alert rules**

Response:
```json
{
  "success": true,
  "data": { "created": 5 }
}
```

---

## Operations (Ops)

### GET /api/ops/summary
**Get operations summary**

Response:
```json
{
  "success": true,
  "data": {
    "generated_at": "2024-01-15T10:00:00Z",
    "totalMachines": 16,
    "onlineMachines": 7,
    "warningMachines": 2,
    "blockedMachines": 1,
    "unreachableMachines": 3,
    "offlineMachines": 2,
    "staleMachines": 1,
    "disabledMachines": 0,
    "scanToday": 1234,
    "totalEmployees": 450,
    "unmappedCount": 23,
    "qualityScore": 85,
    "lastSyncAt": "2024-01-15T07:45:00Z"
  }
}
```

---

### GET /api/ops/incidents
**Get active incidents**

Query Parameters:
- `severity` (optional): LOW, MEDIUM, HIGH, CRITICAL

Response:
```json
{
  "success": true,
  "data": [
    {
      "id": "machine-P1A-BLOCKED",
      "title": "P1A BLOCKED",
      "message": "Port blocked by firewall",
      "severity": "CRITICAL",
      "category": "MACHINE",
      "machineCode": "P1A",
      "createdAt": "2024-01-15T10:00:00Z",
      "status": "OPEN"
    }
  ]
}
```

---

### GET /api/ops/recommendations
**Get operational recommendations**

Response:
```json
{
  "success": true,
  "data": {
    "items": [
      "Periksa firewall/router untuk 1 mesin dengan port blocked.",
      "Review 23 device user id yang belum mapped."
    ]
  }
}
```

---

## Realtime

### GET /api/realtime/sync-status
**SSE endpoint for sync status updates**

Headers:
```
Accept: text/event-stream
```

Response (SSE format):
```
event: connected
data: {"clientId":"abc123","message":"Connected to sync status stream"}

event: sync.started
data: {"machineCode":"P1A","batchCode":"SYNC_xxx","timestamp":"..."}

event: sync.completed
data: {"machineCode":"P1A","recordsSuccess":45,"recordsFailed":2,"timestamp":"..."}
```

---

### GET /api/realtime/live-feed
**SSE endpoint for live attendance feed**

Headers:
```
Accept: text/event-stream
```

Response (SSE format):
```
event: connected
data: {"clientId":"abc123","stats":{...},"machineStatus":[...],"recentBatches":[...],"latestScans":[...]}

event: attendance.new
data: {"raw_device_user_id":"10044","machine_code":"P1A","scan_time":"..."}
```

---

### GET /api/realtime/events
**SSE endpoint for all events**

Query Parameters:
- `events` (optional): Comma-separated event types

Headers:
```
Accept: text/event-stream
```

Response (SSE format):
```
event: connected
data: {"clientId":"abc123","events":["heartbeat","sync.started",...]}

event: ping
data: {"timestamp":"2024-01-15T10:00:00Z"}
```

---

### GET /api/realtime/stats
**Get real-time connection stats**

Response:
```json
{
  "success": true,
  "data": {
    "connectedClients": 5,
    "timestamp": "2024-01-15T10:00:00Z"
  }
}
```

---

### GET /api/realtime/latest-scans
**Get latest attendance scans (polling fallback)**

Query Parameters:
- `limit` (optional): Max records (default 50)

Response:
```json
{
  "success": true,
  "data": {
    "count": 50,
    "latestId": 1,
    "scans": [
      {
        "raw_device_user_id": "10044",
        "machine_code": "P1A",
        "scan_time": "2024-01-15T07:30:00Z",
        "parsed_employee_code": "A0044",
        "mapping_status": "MAPPED"
      }
    ]
  }
}
```

---

### GET /api/realtime/feed-stats
**Get live feed statistics (polling fallback)**

Response:
```json
{
  "success": true,
  "data": {
    "stats": {
      "last_10_minutes": 150,
      "last_30_minutes": 450,
      "last_1_hour": 900,
      "by_machine": []
    },
    "machineStatus": [...],
    "recentBatches": [...]
  }
}
```

---

## Reports

### GET /api/reports/daily
**Get daily report**

Query Parameters:
- `date` (required): YYYY-MM-DD

Response:
```json
{
  "success": true,
  "data": [...]
}
```

---

### GET /api/reports/monthly
**Get monthly report**

Query Parameters:
- `year` (required): YYYY
- `month` (required): 1-12

Response:
```json
{
  "success": true,
  "data": [...]
}
```

---

### GET /api/reports/export/excel
**Export report as Excel**

Query Parameters:
- `type` (optional): daily, monthly, sync-log (default: daily)
- `date` (optional): YYYY-MM-DD (for daily type)
- `year` (optional): YYYY (for monthly type)
- `month` (optional): 1-12 (for monthly type)

Response: Excel file download

---

## Mapping

### GET /api/mapping/review
**Get unmapped records for review**

Response:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "raw_device_user_id": "10099",
      "machine_code": "P1A",
      "scan_time": "2024-01-15T07:30:00Z",
      "mapping_status": "UNMAPPED"
    }
  ]
}
```

---

### POST /api/mapping/preview
**Preview employee code mapping**

Request:
```json
{
  "rawDeviceUserId": "10044",
  "scannerCode": 100,
  "locCode": "A",
  "divisionCode": "P1A",
  "machineCode": "P1A"
}
```

Response:
```json
{
  "success": true,
  "data": {
    "rawId": "10044",
    "parsedCode": "A0044",
    "confidence": 0.95,
    "suggestions": []
  }
}
```

---

## Audit

### GET /api/audit/logs
**Get audit logs**

Response:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "entity_type": "USER",
      "entity_id": "1",
      "action_type": "LOGIN",
      "reason": null,
      "changed_by": 1,
      "changed_at": "2024-01-15T07:00:00Z",
      "ip_address": "192.168.1.100"
    }
  ]
}
```

---

## Error Responses

All endpoints return consistent error format:

```json
{
  "success": false,
  "error": {
    "code": "MACHINE_NOT_FOUND",
    "message": "Machine with code 'XYZ' not found"
  }
}
```

### Common Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNAUTHORIZED` | 401 | Invalid or missing token |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `VALIDATION_ERROR` | 400 | Invalid request parameters |
| `INTERNAL_ERROR` | 500 | Server error |
| `MACHINE_OFFLINE` | 503 | ZKTeco machine unreachable |
| `SYNC_FAILED` | 500 | Sync operation failed |
| `INVALID_INPUT` | 400 | Missing required fields |
| `DUPLICATE_NAME` | 400 | Resource already exists |
| `BAD_REQUEST` | 400 | Invalid request format |

---

## Role-Based Access Control

Some endpoints require specific roles:

| Role | Description | Endpoints |
|------|-------------|-----------|
| `IT_ADMIN` | IT Administrator | Machine config, sync, scheduler, ping tests |
| `HR_ADMIN` | HR Administrator | Employee management, attendance corrections |
| `OPERATOR` | Machine Operator | Sync triggers, ping tests |
| `USER` | Regular User | Read-only access to most endpoints |

Endpoints without role requirements are marked as **Public** or use the route option `{ protected: false }`.