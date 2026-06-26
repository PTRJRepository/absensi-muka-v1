-- Fix attendance_work_config with correct convention (0=Sunday..6=Saturday)
-- Backend uses JavaScript standard: 0=Sunday, 1=Monday, ..., 6=Saturday

BEGIN TRY
    BEGIN TRANSACTION;

    -- Check if table exists
    IF OBJECT_ID('dbo.attendance_work_config', 'U') IS NULL
    BEGIN
        PRINT 'Table attendance_work_config does not exist';
        ROLLBACK;
        RETURN;
    END

    -- Delete existing data
    DELETE FROM attendance_work_config;

    -- Insert with correct convention (0=Sunday)
    INSERT INTO attendance_work_config (day_of_week, day_name, working_minutes, is_workday)
    VALUES
        (0, 'Sunday', 0, 0),
        (1, 'Monday', 420, 1),
        (2, 'Tuesday', 420, 1),
        (3, 'Wednesday', 420, 1),
        (4, 'Thursday', 420, 1),
        (5, 'Friday', 300, 1),
        (6, 'Saturday', 0, 0);

    -- Verify
    PRINT 'Fixed attendance_work_config:';
    SELECT * FROM attendance_work_config ORDER BY day_of_week;

    COMMIT;
    PRINT 'SUCCESS: attendance_work_config fixed with correct convention';
END TRY
BEGIN CATCH
    ROLLBACK;
    PRINT 'ERROR: ' + ERROR_MESSAGE();
    THROW;
END CATCH
