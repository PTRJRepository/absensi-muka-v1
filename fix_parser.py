#!/usr/bin/env python3
import sys

with open('src/modules/mapping/zkteco-employee-code-parser.ts', 'r', encoding='utf-8') as f:
    content = f.read()

start = content.find('/**\n * Parse numeric-only ZKTeco user IDs.')
end = content.find('\n/**\n * Parse with a detected')

if start == -1 or end == -1:
    print(f'ERROR: start={start}, end={end}')
    sys.exit(1)

# Find the function's closing brace
brace_end = content.find('\n}', end)
new_content = content[:start] + '''/**
 * Parse numeric-only ZKTeco user IDs.
 * These can be:
 * - Any length with scanner prefix: Strip prefix -> pad suffix to 4 digits -> prepend locCode
 * - 5 digits without scanner prefix: Fallback using machineLocCode (if provided)
 * - <5 digits: EXCLUDED
 * - >5 digits without scanner prefix: NONE (requires direct DB lookup)
 */
function parseNumericUserId(rawId: string, input: ZktecoUserIdInput): ParsedMappingResult {
  // Check for scanner prefix FIRST - applies to BOTH 5-digit AND long IDs.
  for (const prefix of SCANNER_PREFIXES) {
    if (rawId.startsWith(prefix)) {
      return parseWithScannerPrefix(rawId, prefix);
    }
  }

  // No scanner prefix detected.
  // Rule: <5 digits -> EXCLUDED (too short to parse reliably)
  if (rawId.length < 5) {
    return {
      rawInput: rawId,
      parsedEmployeeCode: null,
      scannerPrefix: null,
      locCode: null,
      confidence: 'EXCLUDED',
      reason: 'RAW_ID_TOO_SHORT',
      allowAutoMap: false,
    };
  }

  // Rule: Numeric >5 digits without valid scanner prefix -> NONE (direct DB lookup required).
  if (rawId.length > 5) {
    return {
      rawInput: rawId,
      parsedEmployeeCode: null,
      scannerPrefix: null,
      locCode: null,
      confidence: 'NONE',
      reason: 'LONG_NUMERIC_ID_REQUIRES_LOOKUP',
      allowAutoMap: false,
    };
  }

  // 5-digit numeric without scanner prefix: use machineLocCode as fallback.
  if (input.machineLocCode) {
    const locCode = input.machineLocCode.toUpperCase();
    const padded = rawId.slice(-4).padStart(4, '0');
    return {
      rawInput: rawId,
      parsedEmployeeCode: `${locCode}${padded}`,
      scannerPrefix: null,
      locCode,
      confidence: 'WEAK',
      reason: `FALLBACK_USING_MACHINE_LOC_CODE_${locCode}_(no_scanner_prefix_detected)`,
      allowAutoMap: true,
    };
  }

  // Fallback: 5-digit numeric but no scanner prefix and no machineLocCode
  return {
    rawInput: rawId,
    parsedEmployeeCode: null,
    scannerPrefix: null,
    locCode: null,
    confidence: 'NONE',
    reason: 'NO_SCANNER_PREFIX_AND_NO_MACHINE_LOC_CODE',
    allowAutoMap: false,
  };
}
''' + content[brace_end+2:]

with open('src/modules/mapping/zkteco-employee-code-parser.ts', 'w', encoding='utf-8') as f:
    f.write(new_content)

print(f'SUCCESS: Replaced bytes {start} to {brace_end+2}')

# Verify the scanner prefix check comes before the >5 digit check
new_content2 = open('src/modules/mapping/zkteco-employee-code-parser.ts', 'r', encoding='utf-8').read()
idx_scanner = new_content2.find('// Check for scanner prefix FIRST')
idx_gt5 = new_content2.find('// Rule: Numeric >5 digits without')
if idx_scanner < idx_gt5:
    print('VERIFIED: Scanner prefix check comes BEFORE >5 digit check')
else:
    print(f'ERROR: Scanner prefix check at {idx_scanner} comes AFTER >5 digit check at {idx_gt5}')
