/**
 * @deprecated Use zkteco-employee-code-parser.ts (SSOT) for all new code.
 *             This module is kept for backward API compatibility only.
 */

import { parseZktecoUserIdToEmployeeCode } from './zkteco-employee-code-parser';

export type MappingStatus = 'MAPPED' | 'UNMAPPED' | 'AMBIGUOUS' | 'NEED_REVIEW' | 'EXCLUDED';

export interface EmployeeCodeMappingInput {
  rawDeviceUserId: string;
  scannerCode?: number | null;
  locCode?: string | null;
  divisionCode?: string | null;
  machineCode?: string | null;
}

export interface EmployeeCodeMappingResult {
  rawDeviceUserId: string;
  employeeCode: string | null;
  detectedDivisionCode: string | null;
  locCode: string | null;
  scannerCode: number | null;
  mappingStatus: MappingStatus;
  mappingReason: string;
}

export function mapEmployeeCode(input: EmployeeCodeMappingInput): EmployeeCodeMappingResult {
  const rawId = input.rawDeviceUserId.trim();

  // Use SSOT parser: scanner prefix in ID takes priority over machine-provided locCode
  const result = parseZktecoUserIdToEmployeeCode({
    zktecoUserId: rawId,
    machineLocCode: input.locCode ?? null,
    machineScannerCode: input.scannerCode ?? null,
  });

  // Map parser confidence to old MappingStatus
  let mappingStatus: MappingStatus;
  if (
    result.reason === 'LONG_RAW_ID_LOOKUP_REQUIRED'
    || result.reason === 'LONG_RAW_ID_NO_PREFIX_LOOKUP_REQUIRED'
    || result.reason === 'RAW_ID_TOO_SHORT_EXCLUDED'
  ) {
    mappingStatus = 'NEED_REVIEW';
  } else if (!result.allowAutoMap) {
    mappingStatus = 'EXCLUDED';
  } else if (result.parsedEmployeeCode) {
    mappingStatus = 'MAPPED';
  } else if (result.confidence === 'NONE') {
    mappingStatus = 'UNMAPPED';
  } else {
    mappingStatus = 'NEED_REVIEW';
  }

  return {
    rawDeviceUserId: input.rawDeviceUserId,
    employeeCode: result.parsedEmployeeCode,
    detectedDivisionCode: input.divisionCode ?? null,
    locCode: result.locCode,
    scannerCode: input.scannerCode ?? null,
    mappingStatus,
    mappingReason: result.reason,
  };
}
