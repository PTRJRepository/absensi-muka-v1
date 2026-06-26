-- Backup attendance_scan_logs before migration 057
-- Date: 2026-06-23
PRINT '=== Backup: attendance_scan_logs ===';

DECLARE @backupTable NVARCHAR(100);
DECLARE @dt NVARCHAR(20);
SET @dt = FORMAT(GETDATE(), 'yyyyMMdd_HHmmss');
SET @backupTable = 'attendance_scan_logs_backup_before_057_' + @dt;

DECLARE @sql NVARCHAR(MAX);
SET @sql = 'SELECT * INTO dbo.' + @backupTable + ' FROM dbo.attendance_scan_logs;';
PRINT 'Creating backup table: ' + @backupTable;
EXEC sp_executesql @sql;

DECLARE @rowCount INT;
SELECT @rowCount = COUNT(*) FROM dbo.attendance_scan_logs;
PRINT 'Backup complete. Rows backed up: ' + CAST(@rowCount AS NVARCHAR(20));
PRINT 'Backup table: ' + @backupTable;
