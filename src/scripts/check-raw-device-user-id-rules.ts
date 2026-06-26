import assert from 'assert';
import { mapEmployeeCode } from '../modules/mapping/employee-code-mapper';
import { resolveRawDeviceUserId } from '../shared/raw-device-user-id';

function main() {
  const short = resolveRawDeviceUserId('14', { locCode: 'A' });
  assert.equal(short.mappingStatus, 'NEED_REVIEW');
  assert.equal(short.mappingReason, 'RAW_ID_TOO_SHORT_EXCLUDED');
  assert.equal(short.parsedEmployeeCode, null);
  assert.equal(short.allowAutoMap, false);

  const fiveDigit = resolveRawDeviceUserId('10044', { locCode: 'A' });
  assert.equal(fiveDigit.rawIdLength, 5);
  assert.equal(fiveDigit.candidateEmployeeCode, null);
  assert.equal(fiveDigit.allowAutoMap, false);
  assert.equal(fiveDigit.mappingReason, 'RAW_ID_TOO_SHORT_EXCLUDED');

  const mappedFiveDigit = mapEmployeeCode({
    rawDeviceUserId: '10044',
    locCode: 'A',
    machineCode: 'P1A',
  });
  assert.equal(mappedFiveDigit.employeeCode, null);
  assert.equal(mappedFiveDigit.mappingStatus, 'NEED_REVIEW');
  assert.equal(mappedFiveDigit.mappingReason, 'RAW_ID_TOO_SHORT_EXCLUDED');

  for (const rawDeviceUserId of ['4000012', '500130', '7000130']) {
    const resolved = resolveRawDeviceUserId(rawDeviceUserId, { locCode: 'A' });
    assert.equal(resolved.mappingStatus, 'NEED_REVIEW');
    assert.equal(resolved.mappingReason, 'PARSED_LONG_RAW_SCANNER_PREFIX');
    assert.notEqual(resolved.parsedEmployeeCode, null);
    assert.notEqual(resolved.candidateEmployeeCode, null);
    assert.equal(resolved.allowAutoMap, true);

    const mapped = mapEmployeeCode({
      rawDeviceUserId,
      locCode: 'A',
      machineCode: 'P1A',
    });
    assert.notEqual(mapped.employeeCode, null);
    assert.equal(mapped.mappingStatus, 'MAPPED');
    assert.match(mapped.mappingReason, /PARSED_SCANNER_PREFIX/);
  }

  console.log('Raw device user ID rules passed');
}

main();
