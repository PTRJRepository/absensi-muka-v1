const mssql = require('mssql');
async function test() {
  try {
    await mssql.connect({server:'10.0.0.110',port:1433,user:'sa',password:process.env.DB_PASSWORD||'',database:'rebinmas_absensi_monitoring',options:{encrypt:false,trustServerCertificate:true},pool:{max:2,min:0}});
    console.log('Connected');
    try {
      const r = await mssql.query`SELECT TOP 3 COALESCE(NULLIF(LTRIM(RTRIM(s.parsed_employee_code)),''),(SELECT TOP 1 e.current_emp_code FROM employees e WHERE LTRIM(RTRIM(e.zkteco_user_id))=LTRIM(RTRIM(s.raw_device_user_id)) AND e.current_emp_code IS NOT NULL ORDER BY e.id DESC),(SELECT TOP 1 e.current_emp_code FROM employees e WHERE LTRIM(RTRIM(e.employee_code))=LTRIM(RTRIM(s.parsed_employee_code)) AND e.current_emp_code IS NOT NULL ORDER BY e.id DESC)) AS emp_code FROM attendance_scan_logs s WHERE s.scan_date='2026-06-01'`;
      console.log('PASSED:',r.recordset.length,'rows');
    } catch(e){console.log('FAILED:',e.message);}
  } catch(e){console.log('Connection FAILED:',e.message);}
  await mssql.close();
}
test().catch(console.error);
