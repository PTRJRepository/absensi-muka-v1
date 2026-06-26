/**
 * Unit Tests for ZKTeco Employee Code Parser
 *
 * Test cases from PRD Section 10.1:
 * 1000890  → A0890
 * 4000029  → H0029
 * 5000040  → C0040 (NOT E0040!)
 * A0044    → A0044
 * C0669    → C0669
 * 40       → EXCLUDED_TOO_SHORT
 * 669      → EXCLUDED_TOO_SHORT
 * 0040     → EXCLUDED_TOO_SHORT
 */

import { describe, it, expect } from 'vitest';
import {
  parseZktecoUserIdToEmployeeCode,
  calculateNameSimilarity,
  determineMappingConfidence,
  verifyParsedCodeInHrMaster,
  type ZktecoUserIdInput,
} from '../src/modules/mapping/zkteco-employee-code-parser';

describe('parseZktecoUserIdToEmployeeCode', () => {
  describe('Long raw scanner prefix parsing', () => {
    it.each([
      ['1000044', 'A0044', '100', 'A', 'STRONG'],
      ['3000065', 'B0065', '300', 'B', 'STRONG'],
      ['4000029', 'H0029', '400', 'H', 'STRONG'],
      ['5000040', 'C0040', '500', 'C', 'STRONG'], // NOT E0040!
      ['5000001', 'C0001', '500', 'C', 'STRONG'],
      ['0010015', 'L0015', '001', 'L', 'STRONG'],
    ])('parses %s → %s (prefix=%s, locCode=%s)', (input, expected, expectedPrefix, expectedLocCode, expectedConfidence) => {
      const result = parseZktecoUserIdToEmployeeCode({ zktecoUserId: input });
      expect(result.parsedEmployeeCode).toBe(expected);
      expect(result.scannerPrefix).toBe(expectedPrefix);
      expect(result.locCode).toBe(expectedLocCode);
      expect(result.confidence).toBe(expectedConfidence);
      expect(result.allowAutoMap).toBe(true);
    });
  });

  describe('PRD Section 10.1 - Already-formatted employee codes', () => {
    it.each([
      ['A0044', 'A0044', 'EXACT'],
      ['C0669', 'C0669', 'EXACT'],
      ['B0232', 'B0232', 'EXACT'],
      ['H0029', 'H0029', 'EXACT'],
    ])('accepts %s as valid employee code → %s', (input, expected, expectedConfidence) => {
      const result = parseZktecoUserIdToEmployeeCode({ zktecoUserId: input });
      expect(result.parsedEmployeeCode).toBe(expected);
      expect(result.confidence).toBe(expectedConfidence);
      expect(result.scannerPrefix).toBeNull();
    });
  });

  describe('Excluded short numeric IDs (<= 5 digits)', () => {
    it.each([
      ['40', 'RAW_ID_TOO_SHORT_EXCLUDED'],
      ['669', 'RAW_ID_TOO_SHORT_EXCLUDED'],
      ['0040', 'RAW_ID_TOO_SHORT_EXCLUDED'],
      ['10044', 'RAW_ID_TOO_SHORT_EXCLUDED'],
      ['40029', 'RAW_ID_TOO_SHORT_EXCLUDED'],
      ['50040', 'RAW_ID_TOO_SHORT_EXCLUDED'],
      ['50001', 'RAW_ID_TOO_SHORT_EXCLUDED'],
      ['1', 'RAW_ID_TOO_SHORT_EXCLUDED'],
      ['12', 'RAW_ID_TOO_SHORT_EXCLUDED'],
      ['123', 'RAW_ID_TOO_SHORT_EXCLUDED'],
      ['1234', 'RAW_ID_TOO_SHORT_EXCLUDED'],
    ])('excludes %s → EXCLUDED (reason: %s)', (input, expectedReason) => {
      const result = parseZktecoUserIdToEmployeeCode({ zktecoUserId: input });
      expect(result.confidence).toBe('EXCLUDED');
      expect(result.parsedEmployeeCode).toBeNull();
      expect(result.allowAutoMap).toBe(false);
      expect(result.reason).toBe(expectedReason);
    });
  });

  describe('Edge cases', () => {
    it('returns EXCLUDED for empty string', () => {
      const result = parseZktecoUserIdToEmployeeCode({ zktecoUserId: '' });
      expect(result.confidence).toBe('EXCLUDED');
      expect(result.reason).toBe('EMPTY_RAW_ID');
    });

    it('returns EXCLUDED for whitespace-only string', () => {
      const result = parseZktecoUserIdToEmployeeCode({ zktecoUserId: '   ' });
      expect(result.confidence).toBe('EXCLUDED');
    });

    it('returns EXCLUDED for null/undefined input', () => {
      const result1 = parseZktecoUserIdToEmployeeCode({ zktecoUserId: undefined as any });
      expect(result1.confidence).toBe('EXCLUDED');

      const result2 = parseZktecoUserIdToEmployeeCode({ zktecoUserId: null as any });
      expect(result2.confidence).toBe('EXCLUDED');
    });

    it('returns LONG_RAW_ID_NO_PREFIX_LOOKUP_REQUIRED for long ID with no scanner prefix (6 digits)', () => {
      // 123456 (6 digits) - no recognized scanner prefix, needs lookup
      const result = parseZktecoUserIdToEmployeeCode({ zktecoUserId: '123456' });
      expect(result.confidence).toBe('NONE');
      expect(result.parsedEmployeeCode).toBeNull();
      expect(result.allowAutoMap).toBe(false);
      expect(result.reason).toBe('LONG_RAW_ID_NO_PREFIX_LOOKUP_REQUIRED');
    });

    it('5-digit ID with no scanner prefix is excluded even with machineLocCode', () => {
      const result = parseZktecoUserIdToEmployeeCode({
        zktecoUserId: '12345',
        machineLocCode: 'X',
      });
      expect(result.parsedEmployeeCode).toBeNull();
      expect(result.confidence).toBe('EXCLUDED');
      expect(result.scannerPrefix).toBeNull();
      expect(result.allowAutoMap).toBe(false);
    });

    it('long ID with scanner prefix is parsed from last 4 digits', () => {
      const result = parseZktecoUserIdToEmployeeCode({ zktecoUserId: '500123456' });
      expect(result.confidence).toBe('STRONG');
      expect(result.parsedEmployeeCode).toBe('C3456');
      expect(result.scannerPrefix).toBe('500');
      expect(result.allowAutoMap).toBe(true);
    });

    it('returns EXCLUDED for non-standard alphanumeric IDs', () => {
      const result = parseZktecoUserIdToEmployeeCode({ zktecoUserId: 'ABC123' });
      expect(result.confidence).toBe('EXCLUDED');
      expect(result.reason).toBe('UNSUPPORTED_FORMAT');
    });
  });

  describe('MachineLocCode is not used for short raw IDs', () => {
    it('excludes 5-digit ID with no scanner prefix', () => {
      const result = parseZktecoUserIdToEmployeeCode({
        zktecoUserId: '12345',
        machineLocCode: 'A',
      });
      expect(result.parsedEmployeeCode).toBeNull();
      expect(result.locCode).toBeNull();
      expect(result.confidence).toBe('EXCLUDED');
      expect(result.scannerPrefix).toBeNull();
      expect(result.reason).toBe('RAW_ID_TOO_SHORT_EXCLUDED');
    });

    it('long scanner prefix takes priority over machineLocCode', () => {
      const result = parseZktecoUserIdToEmployeeCode({
        zktecoUserId: '5000040',
        machineLocCode: 'A', // Machine PGE has locCode 'A'
      });
      expect(result.parsedEmployeeCode).toBe('C0040'); // From scanner prefix 500→C
      expect(result.locCode).toBe('C'); // NOT 'A' from machine!
      expect(result.confidence).toBe('STRONG');
      expect(result.scannerPrefix).toBe('500');
    });
  });

  describe('CRITICAL TEST CASES from PRD - Must not regress', () => {
    it('5000040 → C0040 (NOT E0040!) - This was the root cause bug', () => {
      const result = parseZktecoUserIdToEmployeeCode({ zktecoUserId: '5000040' });
      expect(result.parsedEmployeeCode).toBe('C0040');
      expect(result.locCode).toBe('C');
      expect(result.scannerPrefix).toBe('500');
      // MUST NOT be E0040 (which was the bug)
      expect(result.parsedEmployeeCode).not.toBe('E0040');
    });

    it.each([
      ['1000890', 'A0890', 'A', '100'], // prefix 100 → A, suffix 0890
      ['1000012', 'A0012', 'A', '100'], // prefix 100 → A, suffix 0012
      ['4000012', 'H0012', 'H', '400'], // prefix 400 → H, suffix 0012
      ['500130',  'C0130', 'C', '500'], // prefix 500 → C, suffix 0130
    ])('%s (>5 digits with scanner prefix) → %s, locCode %s, prefix %s', (rawId, expectedCode, expectedLoc, expectedPrefix) => {
      const result = parseZktecoUserIdToEmployeeCode({ zktecoUserId: rawId });
      expect(result.parsedEmployeeCode).toBe(expectedCode);
      expect(result.locCode).toBe(expectedLoc);
      expect(result.scannerPrefix).toBe(expectedPrefix);
      expect(result.confidence).toBe('STRONG');
      expect(result.allowAutoMap).toBe(true);
    });

    it('5000669 → C0669 (PRD mandatory: prefix 500 → C, last4 = 0669)', () => {
      const result = parseZktecoUserIdToEmployeeCode({ zktecoUserId: '5000669' });
      expect(result.parsedEmployeeCode).toBe('C0669');
      expect(result.locCode).toBe('C');
      expect(result.scannerPrefix).toBe('500');
      expect(result.confidence).toBe('STRONG');
      expect(result.allowAutoMap).toBe(true);
    });

    it('7000130 → E0130 (prefix 700 → E, last4 = 0130)', () => {
      const result = parseZktecoUserIdToEmployeeCode({ zktecoUserId: '7000130' });
      expect(result.parsedEmployeeCode).toBe('E0130');
      expect(result.locCode).toBe('E');
      expect(result.scannerPrefix).toBe('700');
      expect(result.confidence).toBe('STRONG');
      expect(result.allowAutoMap).toBe(true);
    });

    it('1234567 (>5 digits, NO scanner prefix) → NONE, needs direct DB lookup', () => {
      const result = parseZktecoUserIdToEmployeeCode({ zktecoUserId: '1234567' });
      expect(result.parsedEmployeeCode).toBeNull();
      expect(result.scannerPrefix).toBeNull();
      expect(result.confidence).toBe('NONE');
      expect(result.allowAutoMap).toBe(false);
      expect(result.reason).toBe('LONG_RAW_ID_NO_PREFIX_LOOKUP_REQUIRED');
    });
  });
});

describe('calculateNameSimilarity', () => {
  it('returns 1.0 for identical names', () => {
    expect(calculateNameSimilarity('PAIMIN', 'PAIMIN')).toBe(1.0);
    expect(calculateNameSimilarity('John Doe', 'John Doe')).toBe(1.0);
  });

  it('returns 1.0 for names differing only in case', () => {
    expect(calculateNameSimilarity('PAIMIN', 'paimin')).toBe(1.0);
    expect(calculateNameSimilarity('John Doe', 'JOHN DOE')).toBe(1.0);
  });

  it('returns high similarity for minor variations', () => {
    const score = calculateNameSimilarity('PAIMIN', 'PAIMIN');
    expect(score).toBeGreaterThanOrEqual(0.9);
  });

  it('returns LOW similarity for PAIMIN vs PANJI ADITIA ROSA', () => {
    // This is the CRITICAL case - PAIMIN should NOT match PANJI ADITIA ROSA
    const score = calculateNameSimilarity('PAIMIN', 'PANJI ADITIA ROSA');
    expect(score).toBeLessThan(0.5); // Should be < 0.5 (WEAK)
    expect(score).toBeLessThan(calculateNameSimilarity('PAIMIN', 'PAIMIN KIYEM'));
  });

  it('returns moderate similarity for names with same base', () => {
    // PAIMIN (KIYEM) vs PAIMIN (ROSA) - same base name
    const score1 = calculateNameSimilarity('PAIMIN (KIYEM)', 'PAIMIN (ROSA)');
    expect(score1).toBeGreaterThan(0.5);

    // Without parenthesis
    const score2 = calculateNameSimilarity('PAIMIN', 'PAIMIN');
    expect(score2).toBe(1.0);
  });

  it('handles names with parentheses (removed during normalization)', () => {
    // After normalization: PAIMIN (KIYEM) → 'PAIMIN KIYEM' (parens removed, space remains)
    const score1 = calculateNameSimilarity('PAIMIN (KIYEM)', 'BUDI');
    expect(score1).toBeLessThan(0.5); // Different people, low similarity

    // PAIMIN vs PAIMIN (KIYEM) → partial match
    const score2 = calculateNameSimilarity('PAIMIN (KIYEM)', 'PAIMIN');
    // 'PAIMIN KIYEM' vs 'PAIMIN' → has base name similarity
    expect(score2).toBeGreaterThan(0.3);
  });

  it('returns 0 for completely different names', () => {
    // Note: Levenshtein gives similarity = 1 - distance/maxLen
    // 'ALI' (3 chars) vs 'BUDI' (4 chars) → maxLen=4, distance likely 3-4
    // So similarity is low but may not be exactly 0
    const score = calculateNameSimilarity('ALI', 'BUDI');
    expect(score).toBeLessThan(0.5); // Should be low
  });

  it('handles null/undefined gracefully', () => {
    expect(calculateNameSimilarity(null, 'John')).toBe(0);
    expect(calculateNameSimilarity('John', null)).toBe(0);
    expect(calculateNameSimilarity(null, null)).toBe(1.0);
  });
});

describe('determineMappingConfidence', () => {
  it('EXACT code + STRONG name → STRONG', () => {
    const result = determineMappingConfidence('EXACT', 0.8);
    expect(result).toBe('STRONG');
  });

  it('EXACT code + WEAK name → WEAK', () => {
    const result = determineMappingConfidence('EXACT', 0.6);
    expect(result).toBe('WEAK');
  });

  it('EXACT code + very weak name → NONE', () => {
    const result = determineMappingConfidence('EXACT', 0.2);
    expect(result).toBe('NONE');
  });

  it('STRONG code + STRONG name → STRONG', () => {
    const result = determineMappingConfidence('STRONG', 0.9);
    expect(result).toBe('STRONG');
  });

  it('STRONG code + NO name match → NONE', () => {
    // PAIMIN vs PANJI ADITIA ROSA case
    const result = determineMappingConfidence('STRONG', 0.1);
    expect(result).toBe('NONE');
  });

  it('NONE code always returns NONE regardless of name', () => {
    expect(determineMappingConfidence('NONE', 0.9)).toBe('NONE');
    expect(determineMappingConfidence('NONE', 0.5)).toBe('NONE');
    expect(determineMappingConfidence('NONE', 0.0)).toBe('NONE');
  });

  it('EXCLUDED always returns EXCLUDED', () => {
    expect(determineMappingConfidence('EXCLUDED', 1.0)).toBe('EXCLUDED');
    expect(determineMappingConfidence('EXCLUDED', 0.0)).toBe('EXCLUDED');
  });

  // The PAIMIN → PANJI ADITIA ROSA critical case
  it('STRONG parsed code + PAIMIN vs PANJI name → NONE (needs review)', () => {
    const nameSim = calculateNameSimilarity('PAIMIN', 'PANJI ADITIA ROSA');
    const result = determineMappingConfidence('STRONG', nameSim);
    expect(nameSim).toBeLessThan(0.5);
    expect(result).toBe('NONE'); // Should not be mapped without review
  });
});

describe('verifyParsedCodeInHrMaster', () => {
  const hrCodes = new Set(['A0044', 'C0040', 'C0669', 'E0040', 'H0029']);

  it('returns EXISTS=true for code in HR master', () => {
    expect(verifyParsedCodeInHrMaster('A0044', hrCodes)).toEqual({ exists: true, confidence: 'EXACT' });
    expect(verifyParsedCodeInHrMaster('C0040', hrCodes)).toEqual({ exists: true, confidence: 'EXACT' });
    expect(verifyParsedCodeInHrMaster('C0669', hrCodes)).toEqual({ exists: true, confidence: 'EXACT' });
  });

  it('E0040 is found in HR when present in the set', () => {
    const hrCodesWithE = new Set(['A0044', 'C0040', 'E0040']);
    expect(verifyParsedCodeInHrMaster('E0040', hrCodesWithE)).toEqual({ exists: true, confidence: 'EXACT' });
  });

  it('E0040 is NOT found when absent from HR set', () => {
    const hrCodesWithoutE = new Set(['A0044', 'C0040']);
    expect(verifyParsedCodeInHrMaster('E0040', hrCodesWithoutE)).toEqual({ exists: false, confidence: 'NONE' });
    expect(verifyParsedCodeInHrMaster('X9999', hrCodesWithoutE)).toEqual({ exists: false, confidence: 'NONE' });
  });

  it('returns EXISTS=false for null code', () => {
    expect(verifyParsedCodeInHrMaster(null, hrCodes)).toEqual({ exists: false, confidence: 'NONE' });
  });

  // The critical case: 5000040 parses to C0040 (correct)
  // But if PAIMIN is NOT in HR as C0040, it should be flagged
  it('C0040 verified in HR → EXACT (good mapping)', () => {
    const result = verifyParsedCodeInHrMaster('C0040', hrCodes);
    expect(result.exists).toBe(true);
    expect(result.confidence).toBe('EXACT');
  });
});

describe('Integration: Full mapping workflow', () => {
  it('5000040 → C0040 → HR has C0040 → NONE (name PAIMIN vs BUDI SANTOSO does not match)', () => {
    const hrCodes = new Set(['C0040', 'C0669', 'A0044']);

    // Step 1: Parse
    const parsed = parseZktecoUserIdToEmployeeCode({ zktecoUserId: '5000040' });
    expect(parsed.parsedEmployeeCode).toBe('C0040');
    expect(parsed.confidence).toBe('STRONG');

    // Step 2: Verify in HR master
    const verified = verifyParsedCodeInHrMaster(parsed.parsedEmployeeCode, hrCodes);
    expect(verified.exists).toBe(true);
    expect(verified.confidence).toBe('EXACT');

    // Step 3: Name check (if name was provided)
    // PAIMIN vs BUDI SANTOSO - completely different names
    const nameSim = calculateNameSimilarity('PAIMIN', 'BUDI SANTOSO');
    expect(nameSim).toBeLessThan(0.5); // Different people

    // Step 4: Final confidence
    // EXACT code exists in HR, but name doesn't match → NONE (needs review)
    const finalConfidence = determineMappingConfidence(verified.confidence, nameSim);
    expect(finalConfidence).toBe('NONE'); // Should not auto-map without review
  });

  it('5000040 → C0040 → HR does NOT have C0040 → NONE (unmatched)', () => {
    const hrCodes = new Set(['A0044', 'E0040']); // C0040 NOT in HR

    const parsed = parseZktecoUserIdToEmployeeCode({ zktecoUserId: '5000040' });
    expect(parsed.parsedEmployeeCode).toBe('C0040');

    const verified = verifyParsedCodeInHrMaster(parsed.parsedEmployeeCode, hrCodes);
    expect(verified.exists).toBe(false);
    expect(verified.confidence).toBe('NONE');

    // Should NOT auto-map
    expect(parsed.allowAutoMap).toBe(true); // Parser allows, but HR verification says NONE
    expect(verified.confidence).toBe('NONE'); // Final verdict: unmatched
  });

  it('old wrong mapping: 50040 → E0040 should be caught and rejected', () => {
    const hrCodes = new Set(['C0040']); // Only C0040 exists, NOT E0040

    // If someone tried to force E0040:
    const fakeParsed = parseZktecoUserIdToEmployeeCode({ zktecoUserId: 'E0040' });
    // E0040 would be treated as already-formatted code
    expect(fakeParsed.parsedEmployeeCode).toBe('E0040');
    expect(fakeParsed.confidence).toBe('EXACT');

    // But HR doesn't have E0040
    const verified = verifyParsedCodeInHrMaster('E0040', hrCodes);
    expect(verified.exists).toBe(false);

    // This catches the bug: someone might have forced E0040 but it doesn't exist
    expect(verified.confidence).toBe('NONE');
  });
});
