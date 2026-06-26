# Bugfix Plan: Attendance Matrix Page Not Rendering

**Date:** 2026-06-20
**Status:** Ready for Execution
**Priority:** High
**Complexity:** Medium

## Problem Summary

The attendance matrix page does not render any data for the selected division. The root cause is **field name mismatches** between:

1. **Backend API** returns: `raw_device_user_id`, `hr_employee_code`, `hr_employee_name`, `machine_code`
2. **useMemo processing** correctly transforms to: `rawId`, `hrCode`, `hrName`, `machineCode`
3. **JSX template** incorrectly accesses: `emp.code`, `emp.name`, `emp.div`, `emp.machine_code`

## Root Cause Analysis

### Data Flow

```
Backend API (/api/attendance/monthly-matrix)
  ↓ returns
MatrixRow[] { raw_device_user_id, hr_employee_code, hr_employee_name, machine_code, scan_time, is_mapped }
  ↓ useMemo processes
employees[] { rawId, hrCode, hrName, machineCode, isMapped, scans: Map }
  ↓ JSX accesses (INCORRECT)
emp.code ❌ undefined
emp.name ❌ undefined
emp.div  ❌ undefined
```

### Field Mapping

| Backend Field | Processed Field | JSX Access (Bug) | JSX Access (Fix) |
|---------------|-----------------|------------------|------------------|
| `raw_device_user_id` | `rawId` | `emp.code` | `emp.rawId` |
| `hr_employee_code` | `hrCode` | `emp.code` | `emp.hrCode` |
| `hr_employee_name` | `hrName` | `emp.name` | `emp.hrName` |
| `machine_code` | `machineCode` | `emp.machine_code` | `emp.machineCode` |
| N/A | N/A | `emp.div` | `emp.machineCode` |

## Tasks

### TASK-001: Fix field name mismatches in AttendanceMatrixPage.tsx

**File:** `frontend/src/components/features/matrix/AttendanceMatrixPage.tsx`

**Changes Required:**

| Line | Current | Fixed |
|------|---------|-------|
| 315 | `attendanceLookup.get(emp.code)` | `attendanceLookup.get(emp.rawId)` |
| 331 | `emp.name` | `emp.hrName` |
| 349 | `emp.machine_code \|\| emp.code` | `emp.machineCode \|\| emp.rawId` |
| 352 | `emp.name \|\| emp.code` | `emp.hrName \|\| emp.rawId` |
| 356 | `emp.machine_code \|\| emp.div` | `emp.machineCode` |
| 363 | `emp.code` | `emp.hrCode` |
| 364 | `emp.name` | `emp.hrName` |
| 367 | `emp.div` | `emp.machineCode` |

## Verification Steps

1. **Build verification:**
   ```bash
   cd frontend && npm run build
   ```

2. **Manual testing:**
   - Navigate to Matrix page
   - Select division P1A
   - Verify matrix renders with data rows
   - Check employee names display correctly
   - Toggle between Data Mesin and Database modes
   - Verify cells show attendance status (H/A/L/S)

3. **Expected results:**
   - Matrix renders with non-empty employee cells
   - No "undefined" text displayed
   - Tooltips show correct employee names

## Dependencies

- Backend API `/api/attendance/monthly-matrix` must be returning data
- `attendance_scan_logs` table must have data for selected division/date

## Time Estimate

- **30 minutes** for implementation and testing

## Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Backend returns empty data | Low | Medium | Verify scan_logs table has data |
| Other field mismatches exist | Low | Low | Visual testing covers all visible fields |
