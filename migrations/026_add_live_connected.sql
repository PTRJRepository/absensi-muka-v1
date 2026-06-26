-- Migration 026: Add live_connected column for real-time machine connection tracking
-- This column tracks whether a machine has an active live ZKTeco TCP connection

IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'attendance_machines' AND COLUMN_NAME = 'live_connected'
)
BEGIN
  ALTER TABLE attendance_machines
  ADD live_connected BIT NOT NULL DEFAULT 0;
END
GO

IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'attendance_machines' AND COLUMN_NAME = 'live_last_heartbeat'
)
BEGIN
  ALTER TABLE attendance_machines
  ADD live_last_heartbeat DATETIME2 NULL;
END
GO
