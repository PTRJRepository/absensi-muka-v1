// Generate SQL from TypeScript source to find paren issues
const fs = require('fs');
const src = fs.readFileSync('src/api/routes/attendance.routes.ts', 'utf8');

function extractTemplate(fnName, endFnName) {
  const start = src.indexOf(`function ${fnName}`);
  const end = src.indexOf(`function ${endFnName}`);
  const body = src.substring(start, end);
  const m = body.match(/return\s*`([\s\S]*?)`;?\s*}$/);
  return m ? m[1] : null;
}

// Extract all helper templates
const rawIdLenSql = extractTemplate('rawDeviceUserIdLengthSql', 'resolvedEmployeeCodeSql');
const resEmpSql = extractTemplate('resolvedEmployeeCodeSql', 'resolvedEmployeeNameSql');
const resNameSql = extractTemplate('resolvedEmployeeNameSql', 'resolvedMappingReasonSql');

// Test resolvedMappingReasonSql with alias 's'
const alias = 's';
const rawLen = rawIdLenSql.replace(/\$\{alias\}/g, alias);
const empSql = resEmpSql.replace(/\$\{alias\}/g, alias);
const nameSql = nameSqlSrc = resNameSql.replace(/\${alias\}/g, alias);
const reasonSql = `CASE
  WHEN ${rawLen} <= 5 THEN 'RAW_ID_TOO_SHORT_EXCLUDED'
  WHEN ${empSql} IS NOT NULL AND ${nameSql} IS NOT NULL THEN 'MAPPED_VIA_EMPLOYEES_TABLE'
  WHEN ${empSql} IS NOT NULL THEN 'MAPPED_VIA_EMPLOYEES_TABLE_PENDING_NAME'
  WHEN ${rawLen} > 5 THEN 'CURRENT_EMP_CODE_NOT_FOUND_NEED_REVIEW'
  ELSE 'UNKNOWN'
END`;

console.log('=== rawDeviceIdLengthSql (alias=s) ===');
console.log(rawLen);
console.log('\n=== resolvedEmployeeCodeSql (alias=s) ===');
console.log(empSql);
console.log('\n=== resolvedEmployeeNameSql (alias=s) ===');
console.log(nameSql);
console.log('\n=== resolvedMappingReasonSql (alias=s) ===');
console.log(reasonSql);

// Count parens for each
function checkParens(name, sql) {
  const lines = sql.split('\n');
  let bal = 0;
  let issues = [];
  for (const line of lines) {
    const o = line.match(/[(]/g) || [];
    const c = line.match(/[)]/g) || [];
    bal += o.length - c.length;
  }
  console.log(`\n${name}: final balance = ${bal}`);
}

checkParens('rawDeviceIdLengthSql', rawLen);
checkParens('resolvedEmployeeCodeSql', empSql);
checkParens('resolvedEmployeeNameSql', nameSql);
checkParens('resolvedMappingReasonSql', reasonSql);
