export type RawDeviceUserIdResolutionStatus = 'INVALID' | 'NEED_REVIEW' | 'MAPPED' | 'UNMAPPED';

export interface RawDeviceUserIdResolution {
  rawDeviceUserId: string;
  normalizedRawDeviceUserId: string;
  mappingStatus: RawDeviceUserIdResolutionStatus;
  mappingReason: string;
  parsedEmployeeCode: string | null;
  candidateEmployeeCode: string | null;
  rawIdLength: number;
  allowAutoMap: boolean;
}

function normalize(value: unknown): string {
  return String(value ?? '').trim();
}

function isNumeric(rawId: string): boolean {
  return /^\d+$/.test(rawId);
}

function isAlphaNumericEmployeeCode(rawId: string): boolean {
  return /^[A-Z]\d+$/.test(rawId);
}

const SCANNER_PREFIX_LOC_CODE: Record<string, string> = {
  '001': 'L',  // IJL
  '100': 'A',  // P1A
  '200': 'J',  // ARC
  '300': 'B',  // P1B
  '400': 'H',  // AB2/MILL
  '500': 'C',  // P2A
  '600': 'D',  // P2B
  '700': 'E',  // DME
  '800': 'F',  // ARA
  '900': 'G',  // AB1
};

function scannerPrefixCode(rawId: string): string | null {
  const prefixLocCode = SCANNER_PREFIX_LOC_CODE[rawId.slice(0, 3)];
  if (!prefixLocCode) return null;
  const padded = rawId.slice(-4).padStart(4, '0');
  return `${prefixLocCode}${padded}`;
}

export function resolveRawDeviceUserId(
  rawDeviceUserId: unknown,
  options: {
    locCode?: string | null;
    scannerCode?: number | null;
  } = {}
): RawDeviceUserIdResolution {
  const normalizedRawDeviceUserId = normalize(rawDeviceUserId);

  if (!normalizedRawDeviceUserId) {
    return {
      rawDeviceUserId: '',
      normalizedRawDeviceUserId: '',
      mappingStatus: 'INVALID',
      mappingReason: 'EMPTY_RAW_DEVICE_USER_ID',
      parsedEmployeeCode: null,
      candidateEmployeeCode: null,
      rawIdLength: 0,
      allowAutoMap: false,
    };
  }

  const rawIdLength = normalizedRawDeviceUserId.length;

  if (isNumeric(normalizedRawDeviceUserId) && rawIdLength <= 5) {
    return {
      rawDeviceUserId: normalizedRawDeviceUserId,
      normalizedRawDeviceUserId,
      mappingStatus: 'NEED_REVIEW',
      mappingReason: 'RAW_ID_TOO_SHORT_EXCLUDED',
      parsedEmployeeCode: null,
      candidateEmployeeCode: null,
      rawIdLength,
      allowAutoMap: false,
    };
  }

  if (isAlphaNumericEmployeeCode(normalizedRawDeviceUserId)) {
    return {
      rawDeviceUserId: normalizedRawDeviceUserId,
      normalizedRawDeviceUserId,
      mappingStatus: 'MAPPED',
      mappingReason: 'RAW_ID_ALREADY_EMPLOYEE_CODE',
      parsedEmployeeCode: normalizedRawDeviceUserId,
      candidateEmployeeCode: normalizedRawDeviceUserId,
      rawIdLength,
      allowAutoMap: true,
    };
  }

  if (isNumeric(normalizedRawDeviceUserId) && rawIdLength > 5) {
    const candidateEmployeeCode = scannerPrefixCode(normalizedRawDeviceUserId);
    return {
      rawDeviceUserId: normalizedRawDeviceUserId,
      normalizedRawDeviceUserId,
      mappingStatus: 'NEED_REVIEW',
      mappingReason: candidateEmployeeCode ? 'PARSED_LONG_RAW_SCANNER_PREFIX' : 'LONG_RAW_ID_LOOKUP_REQUIRED',
      parsedEmployeeCode: candidateEmployeeCode,
      candidateEmployeeCode,
      rawIdLength,
      allowAutoMap: Boolean(candidateEmployeeCode),
    };
  }

  return {
    rawDeviceUserId: normalizedRawDeviceUserId,
    normalizedRawDeviceUserId,
    mappingStatus: 'INVALID',
    mappingReason: 'UNSUPPORTED_RAW_ID_FORMAT',
    parsedEmployeeCode: null,
    candidateEmployeeCode: null,
    rawIdLength,
    allowAutoMap: false,
  };
}
