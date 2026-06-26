-- ============================================================
-- MIGRATION V3: SEED MASTER DATA
-- PT Rebinmas Jaya - Absensi System
-- Date: 2026-05-30
-- ============================================================

-- ============================================================
-- 1. SEED mst_division
-- Schema: division_id, division_code, division_name, loc_code, emp_code_prefix
-- ============================================================

MERGE INTO mst_division AS target
USING (VALUES
    ('PG1A', 'Parit Gunung Estate A',       'A', 'A'),
    ('PG1B', 'Parit Gunung Estate B',       'B', 'B'),
    ('PG2A', 'Parit Gunung Estate A (Luar)', 'C', 'C'),
    ('PG2B', 'Parit Gunung Estate B (Luar)', 'D', 'D'),
    ('DME',  'Darul Makmur Estate',         'E', 'E'),
    ('ARA',  'Aik Ruak Estate',             'F', 'F'),
    ('ARB1', 'Aik Ruak B1 Estate',          'G', 'G'),
    ('ARB2', 'Aik Ruak B2 Estate',          'H', 'H'),
    ('AREC', 'Aik Ruak Estate Center',      'J', 'J'),
    ('IJL',  'Impian Jaya Lestari',         'L', 'L'),
    ('INFRA','Infrastruktur',                'I', 'I'),
    ('STF',  'Staff / Kantor',              'S', 'S'),
    ('SEC',  'Security',                    'K', 'K'),
    ('MGM',  'Management',                  'M', 'M')
) AS source (division_code, division_name, loc_code, emp_code_prefix)
ON target.division_code = source.division_code
WHEN MATCHED THEN UPDATE SET
    target.division_name  = source.division_name,
    target.loc_code       = source.loc_code,
    target.emp_code_prefix= source.emp_code_prefix
WHEN NOT MATCHED THEN INSERT (division_code, division_name, loc_code, emp_code_prefix)
    VALUES (source.division_code, source.division_name, source.loc_code, source.emp_code_prefix);

SELECT 'mst_division seeded' AS msg, COUNT(*) AS row_count FROM mst_division;


-- ============================================================
-- 2. SEED mst_machine
-- Schema: machine_id, machine_code, machine_name, ip_address, port,
--         location, division_id, machine_type
-- ============================================================

MERGE INTO mst_machine AS target
USING (VALUES
    -- PGE (Parit Gunung Estate - Office, accessible)
    ('PGE',    'PGE - Parit Gunung Estate',         '10.0.0.232',     4370, 'PGE',   NULL, 'ZKTECO'),
    -- MILL (Mill / Pabrik, accessible)
    ('MILL',   'MILL - Mill / Pabrik',               '103.127.66.32',  4370, 'MILL',  NULL, 'ZKTECO'),
    -- DME_01 (Darul Makmur Estate 01, accessible)
    ('DME_01', 'DME_01 - Darul Makmur Estate',       '103.144.228.42', 4700, 'DME',   NULL, 'ZKTECO'),
    -- DME_02 (Darul Makmur Estate 02, accessible)
    ('DME_02', 'DME_02 - Darul Makmur Estate',       '103.144.228.42', 4701, 'DME',   NULL, 'ZKTECO'),
    -- ARE (Al Reef Estate, accessible)
    ('ARE',    'ARE - Al Reef Estate',                '103.144.208.154',4370, 'ARE',   NULL, 'ZKTECO'),
    -- ARA (Aik Ruak A Estate, accessible)
    ('ARA',    'ARA - Aik Ruak A Estate',             '103.144.208.154',4800, 'ARA',   NULL, 'ZKTECO'),
    -- ARB2 (Aik Ruak B2, accessible)
    ('ARB2',   'ARB2 - Aik Ruak B2 Estate',           '103.144.208.154',4400, 'ARB2',  NULL, 'ZKTECO'),
    -- IJL (Impian Jaya Lestari, accessible)
    ('IJL',    'IJL - Impian Jaya Lestari',           '103.144.211.226',4370, 'IJL',   NULL, 'ZKTECO'),
    -- ARC_01 (Arco Estate 01 - port forwarding needed)
    ('ARC_01', 'ARC_01 - Arco Estate',               '103.144.208.154',4200, 'ARC',   NULL, 'ZKTECO'),
    -- ARC_02 (Arco Estate 02 - port forwarding needed)
    ('ARC_02', 'ARC_02 - Arco Estate',               '103.144.208.154',4201, 'ARC',   NULL, 'ZKTECO'),
    -- AB1 (Aik Ruak B1 - port forwarding needed)
    ('AB1',    'AB1 - Aik Ruak B1 Estate',           '103.144.208.154',4900, 'ARB1',  NULL, 'ZKTECO'),
    -- P1A (PG1A - API only, non-ZKTeco)
    ('P1A',    'P1A - PG1A via IT Solution API',     '10.0.0.90',      4100, 'PG1A',  NULL, 'API'),
    -- P1B (PG1B - API only, non-ZKTeco)
    ('P1B',    'P1B - PG1B via IT Solution API',     '10.0.0.91',      4300, 'PG1B',  NULL, 'API'),
    -- P2A (PG2A - port forwarding needed + API fallback)
    ('P2A',    'P2A - PG2A via IT Solution API',     '223.25.98.220',  4500, 'PG2A',  NULL, 'API'),
    -- P2B (PG2B - port forwarding needed + API fallback)
    ('P2B',    'P2B - PG2B via IT Solution API',     '223.25.98.220',  4600, 'PG2B',  NULL, 'API')
) AS source (machine_code, machine_name, ip_address, port, location, division_id, machine_type)
ON target.machine_code = source.machine_code
WHEN MATCHED THEN UPDATE SET
    target.machine_name  = source.machine_name,
    target.ip_address    = source.ip_address,
    target.port          = source.port,
    target.location      = source.location,
    target.division_id   = source.division_id,
    target.machine_type  = source.machine_type
WHEN NOT MATCHED THEN INSERT (machine_code, machine_name, ip_address, port, location, division_id, machine_type)
    VALUES (source.machine_code, source.machine_name, source.ip_address, source.port, source.location, source.division_id, source.machine_type);

SELECT 'mst_machine seeded' AS msg, COUNT(*) AS row_count FROM mst_machine;


-- ============================================================
-- 3. SEED attendance_work_config (jam kerja standar)
-- Standard: Senin-Kamis = 7 jam, Jumat = 5 jam
-- ============================================================

MERGE INTO attendance_work_config AS target
USING (VALUES
    (0, 0.00, 'Sunday — Libur'),
    (1, 7.00, 'Monday — 7 jam'),
    (2, 7.00, 'Tuesday — 7 jam'),
    (3, 7.00, 'Wednesday — 7 jam'),
    (4, 7.00, 'Thursday — 7 jam'),
    (5, 5.00, 'Friday — 5 jam'),
    (6, 0.00, 'Saturday — Libur')
) AS source (day_of_week, standard_hours, description)
ON target.day_of_week = source.day_of_week
WHEN MATCHED THEN UPDATE SET
    target.standard_hours = source.standard_hours,
    target.description    = source.description
WHEN NOT MATCHED THEN INSERT (day_of_week, standard_hours, description)
    VALUES (source.day_of_week, source.standard_hours, source.description);

SELECT 'attendance_work_config seeded' AS msg, COUNT(*) AS row_count FROM attendance_work_config;


-- ============================================================
-- 4. SEED attendance_holiday (Indonesian National Holidays 2026)
-- ============================================================

MERGE INTO attendance_holiday AS target
USING (VALUES
    ('2026-01-01', 'Tahun Baru 2026',                  1),
    ('2026-01-29', 'Isra Mikraj Nabi Muhammad SAW',    1),
    ('2026-02-18', 'Imlek 2617',                       1),
    ('2026-03-20', 'Nyepi Tahun Baru Saka 1948',       0),
    ('2026-03-29', 'Maulid Nabi Muhammad SAW',         1),
    ('2026-03-30', 'Maulid Nabi Muhammad SAW (Lebaran)’, 1),
    ('2026-04-03', 'Wafat Isa Al-Masih',               1),
    ('2026-05-01', 'Hari Buruh Internasional',          1),
    ('2026-05-14', 'Kenaikan Isa Al-Masih',            1),
    ('2026-05-25', 'Hari Raya Waisak 2569',            0),
    ('2026-06-01', 'Pancasila',                         1),
    ('2026-06-06', 'Hari Raya Idulfitri 1447 H',       0),
    ('2026-06-07', 'Hari Raya Idulfitri 1447 H (Libur)', 0),
    ('2026-07-14', 'Hari Raya Qurban 1447 H',          0),
    ('2026-08-17', 'Hari Ulang Tahun Kemerdekaan RI',  1),
    ('2026-08-26', 'Tahun Baru Islam 1448 H',           0),
    ('2026-09-06', 'Maulid Nabi Muhammad SAW',          0),
    ('2026-11-09', 'Hari Deepavali',                    0),
    ('2026-12-25', 'Hari Raya Natal',                   0),
    ('2026-12-26', 'Cuti Bersama Navidad',              0)
) AS source (holiday_date, holiday_name, is_national)
ON target.holiday_date = source.holiday_date
WHEN MATCHED THEN UPDATE SET
    target.holiday_name = source.holiday_name,
    target.is_national  = source.is_national
WHEN NOT MATCHED THEN INSERT (holiday_date, holiday_name, is_national)
    VALUES (source.holiday_date, source.holiday_name, source.is_national);

SELECT 'attendance_holiday seeded' AS msg, COUNT(*) AS row_count FROM attendance_holiday;


-- ============================================================
-- 5. SEED mst_employee dari absen_import (emp_code + division mapping)
-- ============================================================

INSERT INTO mst_employee (emp_code, emp_name, home_division_id)
SELECT
    ai.emp_code,
    ai.emp_code AS emp_name,
    d.division_id
FROM (
    SELECT DISTINCT emp_code, division
    FROM absen_import
    WHERE emp_code IS NOT NULL AND emp_code != ''
) ai
LEFT JOIN mst_division d
    ON d.division_code = ai.division
    OR d.emp_code_prefix = LEFT(ai.emp_code, 1)
WHERE NOT EXISTS (
    SELECT 1 FROM mst_employee me WHERE me.emp_code = ai.emp_code
);

SELECT 'mst_employee seeded from absen_import' AS msg, COUNT(*) AS row_count FROM mst_employee;


-- ============================================================
-- 6. VERIFICATION
-- ============================================================

SELECT 'mst_division' AS tbl, COUNT(*) AS cnt FROM mst_division
UNION ALL SELECT 'mst_machine', COUNT(*) FROM mst_machine
UNION ALL SELECT 'mst_employee', COUNT(*) FROM mst_employee
UNION ALL SELECT 'attendance_work_config', COUNT(*) FROM attendance_work_config
UNION ALL SELECT 'attendance_holiday', COUNT(*) FROM attendance_holiday;
