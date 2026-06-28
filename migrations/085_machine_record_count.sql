-- Migration 085: Add machine_record_count to attendance_machines
-- Stores total attendance log count from ZKTeco machine (queried during sync)
-- Used to compare machine data vs DB data (sync gap indicator)

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='attendance_machines' AND COLUMN_NAME='machine_record_count')
  ALTER TABLE dbo.attendance_machines ADD machine_record_count INT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='attendance_machines' AND COLUMN_NAME='machine_record_count_updated_at')
  ALTER TABLE dbo.attendance_machines ADD machine_record_count_updated_at DATETIME2 NULL;
GO
SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='attendance_machines' AND COLUMN_NAME LIKE 'machine_record%';
GO
