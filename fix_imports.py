"""
Fix attendance_imports duplicate key error
Root cause: GROUP BY includes sync_batch_id but UNIQUE constraint doesn't
Fix: Remove sync_batch_id from GROUP BY, use MIN(sync_batch_id) instead
"""

import pyodbc
import time

# Connection string
conn_str = (
    'DRIVER={ODBC Driver 17 for SQL Server};'
    'SERVER=10.0.0.110,1433;'
    'DATABASE=rebinmas_absensi_monitoring;'
    'UID=sa;PWD=<DB_PASSWORD>;TrustServerCertificate=yes'
)

def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}")

def main():
    log("Connecting to database...")
    conn = pyodbc.connect(
        'DRIVER={ODBC Driver 17 for SQL Server};'
        'SERVER=10.0.0.110,1433;'
        'DATABASE=rebinmas_absensi_monitoring;'
        'UID=sa;PWD=<DB_PASSWORD>;TrustServerCertificate=yes;',
        autocommit=True
    )
    cursor = conn.cursor()
    
    try:
        # Step 1: Clear table (autocommit = separate transaction)
        log("STEP 1: Clearing attendance_imports...")
        cursor.execute("TRUNCATE TABLE attendance_imports")
        cursor.execute("SELECT COUNT(*) FROM attendance_imports")
        count = cursor.fetchone()[0]
        log(f"✓ Table cleared. Rows: {count}")
        
        # Step 2: Insert MAPPED records
        log("STEP 2: Inserting MAPPED records...")
        log("  Using fixed GROUP BY (without sync_batch_id)")
        
        insert_mapped = """
        INSERT INTO attendance_imports (
            employee_id, employee_code, division_code,
            attendance_date, attendance_year, attendance_month,
            check_in_at, check_out_at,
            attendance_status, has_work,
            source, source_reference, batch_id, needs_manual_review, raw_scan_log_id,
            gang_code, is_leave, is_sick, is_holiday, overtime_hours
        )
        SELECT
            e.id,
            grp.parsed_employee_code,
            d.division_code,
            grp.scan_date,
            YEAR(grp.scan_date),
            MONTH(grp.scan_date),
            grp.first_scan,
            grp.last_scan,
            CASE WHEN grp.scan_count >= 2 THEN 'HADIR' ELSE 'TIDAK_HADIR' END,
            CASE WHEN grp.scan_count >= 2 THEN 1 ELSE 0 END,
            'ZKTECO',
            grp.machine_code,
            grp.min_sync_batch_id,
            0,
            grp.min_id,
            NULL, 0, 0, 0, 0.00
        FROM (
            SELECT 
                s.parsed_employee_code,
                s.machine_code,
                CAST(s.scan_date AS DATE) AS scan_date,
                MIN(s.sync_batch_id) AS min_sync_batch_id,
                MIN(s.scan_time) AS first_scan,
                MAX(s.scan_time) AS last_scan,
                COUNT(*) AS scan_count,
                MIN(s.id) AS min_id
            FROM attendance_scan_logs s
            WHERE s.mapping_status = 'MAPPED'
            AND s.parsed_employee_code IS NOT NULL
            GROUP BY s.parsed_employee_code, s.machine_code, CAST(s.scan_date AS DATE)
        ) grp
        INNER JOIN employees e ON e.employee_code = grp.parsed_employee_code
        LEFT JOIN divisions d ON d.id = e.division_id;
        """
        
        cursor.execute(insert_mapped)
        mapped_count = cursor.rowcount
        log(f"  ✓ Inserted {mapped_count:,} MAPPED records")
        
        # Step 3: Insert NEED_REVIEW records
        log("STEP 3: Inserting NEED_REVIEW records...")
        
        insert_need_review = """
        INSERT INTO attendance_imports (
            employee_id, employee_code, division_code,
            attendance_date, attendance_year, attendance_month,
            check_in_at, check_out_at,
            attendance_status, has_work,
            source, source_reference, batch_id, needs_manual_review, raw_scan_log_id,
            gang_code, is_leave, is_sick, is_holiday, overtime_hours
        )
        SELECT
            0,
            'MANUAL_' + grp.raw_device_user_id,
            ISNULL(d.division_code, 'MANUAL_REVIEW'),
            grp.scan_date,
            YEAR(grp.scan_date),
            MONTH(grp.scan_date),
            grp.first_scan,
            grp.last_scan,
            CASE WHEN grp.scan_count >= 2 THEN 'HADIR' ELSE 'TIDAK_HADIR' END,
            CASE WHEN grp.scan_count >= 2 THEN 1 ELSE 0 END,
            'ZKTECO',
            grp.machine_code,
            grp.min_sync_batch_id,
            1,
            grp.min_id,
            NULL, 0, 0, 0, 0.00
        FROM (
            SELECT 
                s.raw_device_user_id,
                s.parsed_division_code,
                CAST(s.scan_date AS DATE) AS scan_date,
                s.machine_code,
                MIN(s.sync_batch_id) AS min_sync_batch_id,
                MIN(s.scan_time) AS first_scan,
                MAX(s.scan_time) AS last_scan,
                COUNT(*) AS scan_count,
                MIN(s.id) AS min_id
            FROM attendance_scan_logs s
            WHERE s.mapping_status = 'NEED_REVIEW'
            AND LEN(ISNULL(s.raw_device_user_id, '')) > 0
            GROUP BY s.raw_device_user_id, s.parsed_division_code, CAST(s.scan_date AS DATE), s.machine_code
        ) grp
        LEFT JOIN divisions d ON d.division_code = grp.parsed_division_code;
        """
        
        cursor.execute(insert_need_review)
        need_review_count = cursor.rowcount
        log(f"  ✓ Inserted {need_review_count:,} NEED_REVIEW records")
        
        # Step 4: Report
        log("STEP 4: Final Report...")
        
        cursor.execute("SELECT COUNT(*) FROM attendance_imports")
        total = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(*) FROM attendance_imports WHERE needs_manual_review = 0")
        mapped = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(*) FROM attendance_imports WHERE needs_manual_review = 1")
        manual = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(DISTINCT employee_code) FROM attendance_imports")
        unique_emp = cursor.fetchone()[0]
        
        cursor.execute("SELECT MIN(attendance_date), MAX(attendance_date) FROM attendance_imports")
        date_range = cursor.fetchone()
        
        log("")
        log("=" * 50)
        log("RESULTS SUMMARY")
        log("=" * 50)
        log(f"Total records inserted:     {total:,}")
        log(f"  - MAPPED (auto):          {mapped:,}")
        log(f"  - NEED_REVIEW (manual):   {manual:,}")
        log(f"Unique employees:           {unique_emp:,}")
        log(f"Date range:                 {date_range[0]} to {date_range[1]}")
        log("=" * 50)
        
        # Check for any remaining constraint violations
        cursor.execute("""
            SELECT employee_code, attendance_date, source_reference, COUNT(*) as cnt
            FROM attendance_imports
            GROUP BY employee_code, attendance_date, source_reference
            HAVING COUNT(*) > 1
        """)
        dupes = cursor.fetchall()
        if dupes:
            log(f"\n⚠ WARNING: Found {len(dupes)} duplicate groups!")
            for row in dupes[:10]:
                log(f"  {row}")
        else:
            log("\n✓ No duplicate key violations!")
        
        log("\n✅ FIX COMPLETED SUCCESSFULLY!")
        
    except Exception as e:
        log(f"\n❌ ERROR: {e}")
        raise
    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    main()
