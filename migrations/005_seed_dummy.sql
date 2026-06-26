USE rebinmas_absensi_monitoring;
GO

MERGE roles AS target USING (VALUES
('ADMIN','Administrator','Full application access'),('HR','HR','Attendance correction access'),('MANAGER','Manager','Division monitoring access'),('SYNC_OPERATOR','Sync Operator','Machine sync access'),('VIEWER','Viewer','Read-only access')
) AS source(code,name,description) ON target.code = source.code
WHEN NOT MATCHED THEN INSERT(code,name,description) VALUES(source.code,source.name,source.description);

MERGE divisions AS target USING (VALUES
('DIV-A','Dummy Division A'),('DIV-B','Dummy Division B'),('DIV-C','Dummy Division C'),('DIV-D','Dummy Division D'),('DIV-E','Dummy Division E'),
('P1A','P1A'),('P1B','P1B'),('P2A','P2A'),('P2B','P2B'),('DME','DME'),('ARA','ARA'),('AB1','AB1'),('AB2','AB2'),('ARC','ARC'),('IJL','IJL'),('PGE','PGE')
) AS source(division_code,division_name) ON target.division_code = source.division_code
WHEN NOT MATCHED THEN INSERT(division_code,division_name) VALUES(source.division_code,source.division_name);

MERGE scanner_codes AS target USING (VALUES
('P1A',100,'P1A scanner'),('ARC',200,'ARC scanner'),('P1B',300,'P1B scanner'),('AB2',400,'AB2 scanner'),('P2A',500,'P2A scanner'),('P2B',600,'P2B scanner'),('DME',700,'DME scanner'),('ARA',800,'ARA scanner'),('AB1',900,'AB1 scanner')
) AS source(division_code,scanner_code,description) ON target.scanner_code = source.scanner_code
WHEN NOT MATCHED THEN INSERT(division_code,scanner_code,description) VALUES(source.division_code,source.scanner_code,source.description);

MERGE loc_codes AS target USING (VALUES
('P1A','A','A','P1A loc'),('P1B','B','B','P1B loc'),('P2A','C','C','P2A loc'),('P2B','D','D','P2B loc'),('DME','E','E','DME loc'),('ARA','F','F','ARA loc'),('AB1','G','G','AB1 loc'),('AB2','H','H','AB2 loc'),('ARC','J','J','ARC loc'),('IJL','L','L','IJL loc'),('PGE','A','A','PGE loc')
) AS source(division_code,loc_code,emp_code_prefix,description) ON target.division_code=source.division_code AND target.loc_code=source.loc_code
WHEN NOT MATCHED THEN INSERT(division_code,loc_code,emp_code_prefix,description) VALUES(source.division_code,source.loc_code,source.emp_code_prefix,source.description);
GO
