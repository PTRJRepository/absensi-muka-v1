-- Check if live_connected column exists
IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'attendance_machines' AND COLUMN_NAME = 'live_connected'
)
BEGIN
  ALTER TABLE attendance_machines ADD live_connected BIT NOT NULL DEFAULT 0;
  PRINT 'Added live_connected column';
END
ELSE
BEGIN
  PRINT 'live_connected column already exists';
END

-- Check if live_last_heartbeat column exists
IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'attendance_machines' AND COLUMN_NAME = 'live_last_heartbeat'
)
BEGIN
  ALTER TABLE attendance_machines ADD live_last_heartbeat DATETIME2 NULL;
  PRINT 'Added live_last_heartbeat column';
END
ELSE
BEGIN
  PRINT 'live_last_heartbeat column already exists';
END
GO
