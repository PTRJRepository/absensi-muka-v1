# Plan: Fix All Broken Endpoints

## Issues Found

### 1. /api/divisions/:code/attendance - FIXED
**Problem:** "Invalid column name 'employee_name'"

**Root Cause:** The query used LEFT JOIN with employees table but employee codes don't match:
- attendance_imports.employee_code = "2000134" (numeric string)
- employees.employee_code = "0010001" (with leading zeros)

**Fix:** Removed JOIN and changed to use employee_code directly.

### 2. /api/divisions/compare - FIXED
**Problem:** "Division not found" even with valid codes

**Root Cause:** Route ordering - /api/divisions/:code was matched before /api/divisions/compare

**Fix:** Moved /api/divisions/compare route BEFORE /api/divisions/:code

## Files Modified
1. src/api/routes/division.routes.ts

## All Endpoints Tested and Working
- GET /api/divisions
- GET /api/divisions/:code
- GET /api/divisions/compare
- GET /api/divisions/:code/attendance
- GET /api/dashboard/*
- GET /api/attendance/*
- GET /api/employees
- GET /api/machines
- GET /api/monitoring/*
- GET /api/quality/*
