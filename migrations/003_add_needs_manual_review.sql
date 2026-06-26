-- Migration: Add needs_manual_review column to attendance_imports
-- Date: 2026-06-19
-- Purpose: Support routing unmapped/need_review records to MANUAL_REVIEW division

-- Add needs_manual_review column if it doesn't exist
IF NOT EXISTS (
    SELECT 1 FROM sys.columns 
    WHERE object_id = OBJECT_ID('attendance_imports') 
    AND name = 'needs_manual_review'
)
BEGIN
    ALTER TABLE attendance_imports 
    ADD needs_manual_review BIT NOT NULL DEFAULT 0;
    
    PRINT 'Added column: attendance_imports.needs_manual_review';
END
ELSE
BEGIN
    PRINT 'Column already exists: attendance_imports.needs_manual_review';
END
GO

-- Add index for manual review queries
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes 
    WHERE object_id = OBJECT_ID('attendance_imports') 
    AND name = 'IX_attendance_imports_manual_review'
)
BEGIN
    CREATE INDEX IX_attendance_imports_manual_review 
    ON attendance_imports(division_code, needs_manual_review);
    
    PRINT 'Created index: IX_attendance_imports_manual_review';
END
GO
