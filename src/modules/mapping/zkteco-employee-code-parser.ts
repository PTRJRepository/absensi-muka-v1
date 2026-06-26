/**
 * ZKTeco Employee Code Parser - Single Source of Truth
 *
 * This module is the ONLY place where ZKTeco user IDs are parsed to employee codes.
 * All other modules MUST use this parser. No duplicate parsing logic allowed.
 *
 * Scanner Prefix → locCode mapping:
 *   001 → L (IJL)
 *   100 → A (P1A)
 *   200 → J (ARC)
 *   300 → B (P1B)
 *   400 → H (AB2)
 *   500 → C (P2A)
 *   600 → D (P2B)
 *   700 → E (DME)
 *   800 → F (ARA)
 *   900 → G (AB1)
 *
 * CRITICAL RULES:
 * 1. If zktecoUserId starts with a scanner prefix, use THAT prefix's locCode, NOT machineLocCode
 * 2. machineLocCode is ONLY a fallback when no scanner prefix detected
 * 3. Numeric IDs with <=5 digits are EXCLUDED from auto-mapping
 * 4. Numeric-only IDs >5 digits without scanner prefix need lookup, not direct parsing
 */

export type MappingConfidence = 'EXACT' | 'STRONG' | 'WEAK' | 'NONE' | 'EXCLUDED';

export interface ZktecoUserIdInput {
  zktecoUserId: string;
  machineCode?: string;
  machineLocCode?: string | null;
  machineScannerCode?: string | number | null;
  zktecoUserName?: string | null;
}

export interface ParsedMappingResult {
  rawInput: string;
  parsedEmployeeCode: string | null;
  scannerPrefix: string | null;
  locCode: string | null;
  confidence: MappingConfidence;
  reason: string;
  allowAutoMap: boolean;
}

// Scanner prefix → locCode mapping
const SCANNER_PREFIX_MAP: Record<string, string> = {
  '001': 'L',
  '100': 'A',
  '200': 'J',
  '300': 'B',
  '400': 'H',
  '500': 'C',
  '600': 'D',
  '700': 'E',
  '800': 'F',
  '900': 'G',
};

// Valid scanner prefixes (sorted longest first for greedy matching)
const SCANNER_PREFIXES = Object.keys(SCANNER_PREFIX_MAP).sort((a, b) => b.length - a.length);

/**
 * Parse a ZKTeco user ID to an employee code candidate.
 *
 * This function implements the CORRECT parsing logic:
 * - Strip scanner prefix from ID if present (takes PRIORITY over machineLocCode)
 * - Use scanner prefix's locCode, NOT machine's locCode
 * - Return EXCLUDED for numeric IDs <= 5 digits
 * - Return NONE for IDs >5 digits without valid scanner prefix (needs direct DB lookup)
 *
 * @param input - The parsing input
 * @returns ParsedMappingResult with the parsing outcome
 */
export function parseZktecoUserIdToEmployeeCode(input: ZktecoUserIdInput): ParsedMappingResult {
  const rawId = input.zktecoUserId?.trim() ?? '';

  // Rule: Empty/null input → EXCLUDED
  if (!rawId) {
    return {
      rawInput: input.zktecoUserId ?? '',
      parsedEmployeeCode: null,
      scannerPrefix: null,
      locCode: null,
      confidence: 'EXCLUDED',
      reason: 'EMPTY_RAW_ID',
      allowAutoMap: false,
    };
  }

  // Rule: If already in [A-Z][0-9]{4} format, use directly
  if (/^[A-Z]\d{4}$/.test(rawId)) {
    return {
      rawInput: rawId,
      parsedEmployeeCode: rawId,
      scannerPrefix: null,
      locCode: rawId[0],
      confidence: 'EXACT',
      reason: 'RAW_ID_ALREADY_EMPLOYEE_CODE',
      allowAutoMap: true,
    };
  }

  // Rule: Numeric-only IDs
  if (/^\d+$/.test(rawId)) {
    return parseNumericUserId(rawId, input);
  }

  // Rule: Non-numeric, non-standard format → EXCLUDED
  return {
    rawInput: rawId,
    parsedEmployeeCode: null,
    scannerPrefix: null,
    locCode: null,
    confidence: 'EXCLUDED',
    reason: 'UNSUPPORTED_FORMAT',
    allowAutoMap: false,
  };
}

/**
 * Parse numeric-only ZKTeco user IDs.
 *
 * CRITICAL: Scanner prefix check MUST run first — for ALL numeric lengths.
 * Order: <=5 -> excluded, long scanner prefix -> parse, long no-prefix -> lookup.
 */
/* eslint-disable @typescript-eslint/no-inferrable-types */
function parseNumericUserId(rawId: string, input: ZktecoUserIdInput): ParsedMappingResult {
  void input;
  if (rawId.length <= 5) {
    return { rawInput: rawId, parsedEmployeeCode: null, scannerPrefix: null, locCode: null, confidence: 'EXCLUDED', reason: 'RAW_ID_TOO_SHORT_EXCLUDED', allowAutoMap: false };
  }
  // Long numeric scanner IDs are parsed by prefix + last 4 digits.
  switch (rawId.substring(0, 3)) {
    case '001': return parseWithScannerPrefix(rawId, '001');
    case '100': return parseWithScannerPrefix(rawId, '100');
    case '200': return parseWithScannerPrefix(rawId, '200');
    case '300': return parseWithScannerPrefix(rawId, '300');
    case '400': return parseWithScannerPrefix(rawId, '400');
    case '500': return parseWithScannerPrefix(rawId, '500');
    case '600': return parseWithScannerPrefix(rawId, '600');
    case '700': return parseWithScannerPrefix(rawId, '700');
    case '800': return parseWithScannerPrefix(rawId, '800');
    case '900': return parseWithScannerPrefix(rawId, '900');
  }
  // Long numeric IDs without scanner prefix need exact/manual lookup.
  return { rawInput: rawId, parsedEmployeeCode: null, scannerPrefix: null, locCode: null, confidence: 'NONE', reason: 'LONG_RAW_ID_NO_PREFIX_LOOKUP_REQUIRED', allowAutoMap: false };
}
/* eslint-enable complexity */


/**
 * Parse with a detected scanner prefix.
 *
 * Algorithm:
 * 1. Strip the 3-digit scanner prefix
 * 2. Take the remaining digits (up to 4 max) — last 4 digits of suffix
 * 3. Pad left with zeros to 4 digits
 * 4. Prepend with locCode from scanner prefix
 *
 * Examples:
 *   5000040 → strip '500' → '0040' → '0040' → 'C0040'
 *   7000040 → strip '700' → '0040' → '0040' → 'E0040'
 */
function parseWithScannerPrefix(rawId: string, prefix: string): ParsedMappingResult {
  const locCode = SCANNER_PREFIX_MAP[prefix];
  const suffix = rawId.slice(prefix.length);
  const paddedSuffix = suffix.slice(-4).padStart(4, '0');
  return {
    rawInput: rawId,
    parsedEmployeeCode: `${locCode}${paddedSuffix}`,
    scannerPrefix: prefix,
    locCode,
    confidence: 'STRONG',
    reason: `PARSED_SCANNER_PREFIX_${prefix}_LOC_${locCode}`,
    allowAutoMap: true,
  };
}

/**
 * Verify if a parsed employee code exists in the HR employee master.
 * This is a SECOND validation step after parsing.
 *
 * Returns the confidence level based on HR master lookup:
 * - EXACT: Code found in HR master
 * - NONE: Code NOT found in HR master (should be UNMAPPED)
 */
export function verifyParsedCodeInHrMaster(
  parsedCode: string | null,
  hrEmployeeCodes: Set<string>
): { exists: boolean; confidence: MappingConfidence } {
  if (!parsedCode) {
    return { exists: false, confidence: 'NONE' };
  }
  const exists = hrEmployeeCodes.has(parsedCode);
  return {
    exists,
    confidence: exists ? 'EXACT' : 'NONE',
  };
}

/**
 * Name similarity scoring using Levenshtein distance.
 *
 * Normalization steps:
 * 1. Uppercase
 * 2. Trim whitespace
 * 3. Remove non-alphanumeric characters
 * 4. Remove text inside parentheses (e.g., "PAIMIN (KIYEM)" → "PAIMIN")
 *
 * Returns a score from 0 to 1, where 1 = identical.
 */
export function calculateNameSimilarity(
  name1: string | null | undefined,
  name2: string | null | undefined
): number {
  if (!name1 && !name2) return 1.0;
  if (!name1 || !name2) return 0.0;

  const normalized1 = normalizeNameForComparison(name1);
  const normalized2 = normalizeNameForComparison(name2);

  if (normalized1 === normalized2) return 1.0;
  if (normalized1.length === 0 || normalized2.length === 0) return 0.0;

  const distance = levenshteinDistance(normalized1, normalized2);
  const maxLen = Math.max(normalized1.length, normalized2.length);
  return 1 - distance / maxLen;
}

function normalizeNameForComparison(name: string): string {
  return name
    .toUpperCase()
    .trim()
    .replace(/\s+/g, ' ')
    // Remove text inside parentheses BEFORE other processing
    // This handles "PAIMIN (KIYEM)" → "PAIMIN" for comparison
    .replace(/\([^)]*\)/g, '')
    .replace(/[^A-Z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Determine mapping confidence based on code match and name similarity.
 *
 * Confidence levels:
 * - EXACT code + name similarity >= 0.8 → STRONG
 * - EXACT code + name similarity >= 0.5 → WEAK
 * - EXACT code + name similarity < 0.5 → NONE
 * - NONE/EXCLUDED code → NONE/EXCLUDED (unchanged)
 */
export function determineMappingConfidence(
  codeConfidence: MappingConfidence,
  nameSimilarity: number
): MappingConfidence {
  if (codeConfidence === 'NONE' || codeConfidence === 'EXCLUDED') {
    return codeConfidence;
  }

  if (nameSimilarity >= 0.8) return 'STRONG';
  if (nameSimilarity >= 0.5) return 'WEAK';
  return 'NONE';
}

export type NameValidationConfidence = 'STRONG_NAME_MATCH' | 'WEAK_NAME_MATCH' | 'NAME_MISMATCH' | 'NO_NAME_DATA';

export interface NameValidationResult {
  confidence: NameValidationConfidence;
  nameSimilarity: number;
  zktecoName: string | null;
  hrName: string | null;
  reason: string;
  allowAutoMap: boolean;
}

/**
 * Validate a mapping by comparing ZKTeco user name with HR employee name.
 *
 * Rule:
 * - name similarity >= 0.8 → STRONG_NAME_MATCH (auto-map OK)
 * - name similarity >= 0.5 → WEAK_NAME_MATCH (map but mark NEED_REVIEW)
 * - name similarity < 0.5 → NAME_MISMATCH (NEED_REVIEW, manual review required)
 * - no name data → NO_NAME_DATA (WEAK_NAME_MATCH — proceed with caution)
 *
 * Example: PAIMIN vs PANJI ADITIA ROSA → NAME_MISMATCH (similarity < 0.5)
 * Example: SUBHANA NUGRAHA vs SUBHANA NUGRAHA (ROHANA) → STRONG_NAME_MATCH (similarity >= 0.8)
 */
export function validateNameMatch(
  zktecoUserName: string | null | undefined,
  hrEmployeeName: string | null | undefined
): NameValidationResult {
  const zkteco = zktecoUserName?.trim() || null;
  const hr = hrEmployeeName?.trim() || null;

  if (!zkteco && !hr) {
    return {
      confidence: 'NO_NAME_DATA',
      nameSimilarity: 1.0,
      zktecoName: null,
      hrName: null,
      reason: 'NO_NAME_DATA_BOTH_NULL',
      allowAutoMap: true,
    };
  }

  if (!zkteco || !hr) {
    return {
      confidence: 'NO_NAME_DATA',
      nameSimilarity: 0,
      zktecoName: zkteco,
      hrName: hr,
      reason: 'NO_NAME_DATA_ONE_NULL',
      allowAutoMap: true, // proceed but mark for review
    };
  }

  const similarity = calculateNameSimilarity(zkteco, hr);

  if (similarity >= 0.8) {
    return {
      confidence: 'STRONG_NAME_MATCH',
      nameSimilarity: similarity,
      zktecoName: zkteco,
      hrName: hr,
      reason: `STRONG_NAME_MATCH_similarity_${(similarity * 100).toFixed(0)}pct`,
      allowAutoMap: true,
    };
  }

  if (similarity >= 0.5) {
    return {
      confidence: 'WEAK_NAME_MATCH',
      nameSimilarity: similarity,
      zktecoName: zkteco,
      hrName: hr,
      reason: `WEAK_NAME_MATCH_similarity_${(similarity * 100).toFixed(0)}pct`,
      allowAutoMap: true, // allow but mark NEED_REVIEW
    };
  }

  return {
    confidence: 'NAME_MISMATCH',
    nameSimilarity: similarity,
    zktecoName: zkteco,
    hrName: hr,
    reason: `NAME_MISMATCH_similarity_${(similarity * 100).toFixed(0)}pct_PAIMIN_vs_PANJI_not_auto_mapped`,
    allowAutoMap: false, // BLOCK auto-map
  };
}

/**
 * Combined mapping result including both code and name validation.
 */
export interface CombinedMappingResult {
  parsedEmployeeCode: string | null;
  scannerPrefix: string | null;
  locCode: string | null;
  codeConfidence: MappingConfidence;
  nameValidation: NameValidationResult;
  finalConfidence: 'EXACT' | 'STRONG' | 'WEAK' | 'NEED_REVIEW' | 'UNMAPPED' | 'EXCLUDED';
  finalReason: string;
  allowAutoMap: boolean;
}

/**
 * Full validation: code parsing + HR master lookup + name validation.
 *
 * Use this for mapping decisions where both code and name must pass.
 */
export function validateFullMapping(
  input: ZktecoUserIdInput,
  employeeCodes: Set<string>,
  employeeNameLookup: (empCode: string) => string | null
): CombinedMappingResult {
  const codeResult = parseZktecoUserIdToEmployeeCode(input);

  if (!codeResult.allowAutoMap || !codeResult.parsedEmployeeCode) {
    return {
      parsedEmployeeCode: null,
      scannerPrefix: null,
      locCode: null,
      codeConfidence: codeResult.confidence,
      nameValidation: { confidence: 'NO_NAME_DATA', nameSimilarity: 0, zktecoName: null, hrName: null, reason: 'CODE_NOT_VALID', allowAutoMap: false },
      finalConfidence: codeResult.confidence === 'EXCLUDED' ? 'EXCLUDED' : 'UNMAPPED',
      finalReason: codeResult.reason,
      allowAutoMap: false,
    };
  }

  const verification = verifyParsedCodeInHrMaster(codeResult.parsedEmployeeCode, employeeCodes);

  if (!verification.exists) {
    return {
      parsedEmployeeCode: codeResult.parsedEmployeeCode,
      scannerPrefix: codeResult.scannerPrefix,
      locCode: codeResult.locCode,
      codeConfidence: verification.confidence,
      nameValidation: { confidence: 'NO_NAME_DATA', nameSimilarity: 0, zktecoName: null, hrName: null, reason: 'CODE_NOT_IN_HR_MASTER', allowAutoMap: false },
      finalConfidence: 'UNMAPPED',
      finalReason: codeResult.reason + '_CODE_NOT_FOUND_IN_DB_PTRJ',
      allowAutoMap: false,
    };
  }

  // Code found in HR master — now validate name
  const hrName = employeeNameLookup(codeResult.parsedEmployeeCode);
  const nameResult = validateNameMatch(input.zktecoUserName ?? null, hrName);

  // Final confidence = code confidence combined with name confidence
  let finalConfidence: CombinedMappingResult['finalConfidence'];
  let finalReason: string;
  let allowAutoMap: boolean;

  if (nameResult.confidence === 'NAME_MISMATCH') {
    finalConfidence = 'NEED_REVIEW';
    finalReason = codeResult.reason + '_NAME_MISMATCH_' + nameResult.reason;
    allowAutoMap = false; // BLOCK auto-map due to name mismatch
  } else if (nameResult.confidence === 'STRONG_NAME_MATCH' && verification.confidence === 'EXACT') {
    finalConfidence = 'EXACT';
    finalReason = codeResult.reason + '_STRONG_NAME_VALIDATED';
    allowAutoMap = true;
  } else if (nameResult.confidence === 'WEAK_NAME_MATCH' || nameResult.confidence === 'NO_NAME_DATA') {
    finalConfidence = 'WEAK';
    finalReason = codeResult.reason + '_' + nameResult.reason;
    allowAutoMap = true; // allow but flag for review
  } else {
    finalConfidence = 'STRONG';
    finalReason = codeResult.reason + '_' + nameResult.reason;
    allowAutoMap = true;
  }

  return {
    parsedEmployeeCode: codeResult.parsedEmployeeCode,
    scannerPrefix: codeResult.scannerPrefix,
    locCode: codeResult.locCode,
    codeConfidence: verification.confidence,
    nameValidation: nameResult,
    finalConfidence,
    finalReason,
    allowAutoMap,
  };
}
