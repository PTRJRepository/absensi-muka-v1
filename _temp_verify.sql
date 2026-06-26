SET NOCOUNT ON; 
SELECT TOP 10
    id,
    machine_code,
    raw_device_user_id,
    parsed_employee_code,
    mapping_status,
    scan_date
FROM attendance_scan_logs
WHERE raw_device_user_id IN ('50040', '5000669', '700040', '10044')
ORDER BY raw_device_user_id, scan_date DESC;
