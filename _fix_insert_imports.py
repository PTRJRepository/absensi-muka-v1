import pyodbc

conn_str = "DRIVER={ODBC Driver 17 for SQL Server};SERVER=10.0.0.110;UID=sa;PWD=<DB_PASSWORD>;DATABASE=rebinmas_absensi_monitoring;TrustServerCertificate=yes"
conn = pyodbc.connect(conn_str)
conn.autocommit = True
cur = conn.cursor()

# Truncate table first
cur.execute("TRUNCATE TABLE attendance_imports")
cur.execute("SELECT COUNT(*) FROM attendance_imports")
print(f"After truncate: {cur.fetchone()[0]} rows")

# Get all MAPPED groups
cur.execute("""
SELECT 
    s.parsed_employee_code,
    s.parsed_division_code,
    CAST(s.scan_date AS DATE) AS scan_date,
    s.machine_code,
    s.sync_batch_id,
    MIN(s.scan_time) AS first_scan,
    MAX(s.scan_time) AS last_scan,
    COUNT(*) AS scan_count,
    MIN(s.id) AS min_id
FROM attendance_scan_logs s
WHERE s.mapping_status = 'MAPPED'
AND s.parsed_employee_code IS NOT NULL
GROUP BY s.parsed_employee_code, s.parsed_division_code, CAST(s.scan_date AS DATE), s.machine_code, s.sync_batch_id
""")
groups = cur.fetchall()
print(f"Total MAPPED groups to insert: {len(groups)}")

# Insert in batches
inserted = 0
skipped = 0
errors = 0

for grp in groups:
    parsed_emp_code = grp[0]
    parsed_div_code = grp[1]
    scan_date = grp[2]
    machine_code = grp[3]
    batch_id = grp[4]
    first_scan = grp[5]
    last_scan = grp[6]
    scan_count = grp[7]
    min_id = grp[8]
    
    # Get employee_id and division_code
    cur.execute("SELECT id, division_id FROM employees WHERE employee_code = ?", (parsed_emp_code,))
    emp_row = cur.fetchone()
    if not emp_row:
        skipped += 1
        continue
    
    emp_id = emp_row[0]
    div_id = emp_row[1]
    
    # Get division_code
    if div_id:
        cur.execute("SELECT division_code FROM divisions WHERE id = ?", (div_id,))
        div_row = cur.fetchone()
        div_code = div_row[0] if div_row else parsed_div_code
    else:
        div_code = parsed_div_code
    
    status = 'HADIR' if scan_count >= 2 else 'TIDAK_HADIR'
    has_work = 1 if scan_count >= 2 else 0
    att_year = scan_date.year
    att_month = scan_date.month
    
    try:
        cur.execute("""
            INSERT INTO attendance_imports (
                employee_id, employee_code, division_code,
                attendance_date, attendance_year, attendance_month,
                check_in_at, check_out_at,
                attendance_status, has_work,
                source, source_reference, batch_id, needs_manual_review, raw_scan_log_id,
                gang_code, is_leave, is_sick, is_holiday, overtime_hours
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ZKTECO', ?, ?, 0, ?, NULL, 0, 0, 0, 0.00)
        """, (emp_id, parsed_emp_code, div_code, scan_date, att_year, att_month,
              first_scan, last_scan, status, has_work, machine_code, batch_id, min_id))
        inserted += 1
    except pyodbc.Error as e:
        if '2627' in str(e):  # duplicate key
            skipped += 1
        else:
            errors += 1
            print(f"Error for {parsed_emp_code} {scan_date}: {e}")
    
    if inserted % 10000 == 0 and inserted > 0:
        print(f"  Inserted: {inserted}, Skipped: {skipped}, Errors: {errors}")

print(f"\nMAPPED: inserted={inserted}, skipped={skipped}, errors={errors}")

# Now insert NEED_REVIEW
cur.execute("""
SELECT 
    s.raw_device_user_id,
    s.parsed_division_code,
    CAST(s.scan_date AS DATE) AS scan_date,
    s.machine_code,
    s.sync_batch_id,
    MIN(s.scan_time) AS first_scan,
    MAX(s.scan_time) AS last_scan,
    COUNT(*) AS scan_count,
    MIN(s.id) AS min_id
FROM attendance_scan_logs s
WHERE s.mapping_status = 'NEED_REVIEW'
AND LEN(ISNULL(s.raw_device_user_id, '')) > 0
GROUP BY s.raw_device_user_id, s.parsed_division_code, CAST(s.scan_date AS DATE), s.machine_code, s.sync_batch_id
""")
nr_groups = cur.fetchall()
print(f"\nNEED_REVIEW groups: {len(nr_groups)}")

nr_inserted = 0
nr_skipped = 0

for grp in nr_groups:
    raw_user_id = grp[0]
    parsed_div = grp[1]
    scan_date = grp[2]
    machine_code = grp[3]
    batch_id = grp[4]
    first_scan = grp[5]
    last_scan = grp[6]
    scan_count = grp[7]
    min_id = grp[8]
    
    emp_code = 'MANUAL_' + raw_user_id
    status = 'HADIR' if scan_count >= 2 else 'TIDAK_HADIR'
    has_work = 1 if scan_count >= 2 else 0
    att_year = scan_date.year
    att_month = scan_date.month
    
    # Get division_code
    if parsed_div:
        cur.execute("SELECT division_code FROM divisions WHERE division_code = ?", (parsed_div,))
        div_row = cur.fetchone()
        div_code = div_row[0] if div_row else 'MANUAL_REVIEW'
    else:
        div_code = 'MANUAL_REVIEW'
    
    try:
        cur.execute("""
            INSERT INTO attendance_imports (
                employee_id, employee_code, division_code,
                attendance_date, attendance_year, attendance_month,
                check_in_at, check_out_at,
                attendance_status, has_work,
                source, source_reference, batch_id, needs_manual_review, raw_scan_log_id,
                gang_code, is_leave, is_sick, is_holiday, overtime_hours
            ) VALUES (0, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ZKTECO', ?, ?, 1, ?, NULL, 0, 0, 0, 0.00)
        """, (emp_code, div_code, scan_date, att_year, att_month,
              first_scan, last_scan, status, has_work, machine_code, batch_id, min_id))
        nr_inserted += 1
    except pyodbc.Error as e:
        if '2627' in str(e) or '547' in str(e):  # duplicate or FK
            nr_skipped += 1
        else:
            print(f"NR Error for {emp_code}: {e}")
    
    if nr_inserted % 10000 == 0 and nr_inserted > 0:
        print(f"  NR Inserted: {nr_inserted}, Skipped: {nr_skipped}")

print(f"NEED_REVIEW: inserted={nr_inserted}, skipped={nr_skipped}")

# Final stats
cur.execute("""
SELECT 
    COUNT(*) as total,
    SUM(CASE WHEN needs_manual_review = 1 THEN 1 ELSE 0 END) as needs_review,
    SUM(CASE WHEN attendance_status = 'HADIR' THEN 1 ELSE 0 END) as hadir,
    SUM(CASE WHEN attendance_status = 'TIDAK_HADIR' THEN 1 ELSE 0 END) as tidak_hadir,
    COUNT(DISTINCT employee_code) as unique_emp
FROM attendance_imports
""")
row = cur.fetchone()
print(f"\n=== FINAL ===")
print(f"Total attendance_imports: {row[0]}")
print(f"  Hadir: {row[2]}, Tidak Hadir: {row[3]}")
print(f"  Needs manual review: {row[1]}")
print(f"  Unique employees: {row[4]}")

conn.close()
