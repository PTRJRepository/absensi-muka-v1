/**
 * Manual Import Service
 *
 * Handles manual/USB file import from ZKTeco machines
 * Part of Phase 5: Advanced Features
 */

import { SqlClient } from '../../shared/database/sql-client';
import { ImportJobService } from './import-job.service';
import { EmployeeMappingService } from '../employees/employee-mapping.service';
import { MachineRepository } from '../machines/machine.repository';
import { getWibDateKey } from '../../shared/timezone';
import { resolveRawDeviceUserId } from '../../shared/raw-device-user-id';

export interface ImportFileResult {
  success: boolean;
  records: number;
  errors: string[];
  warnings: string[];
}

export interface ParsedAttendance {
  deviceUserId: string;
  recordTime: Date;
  userSn: number;
  verifyMode?: number;
  inOutMode?: number;
}

export interface ImportPreview {
  machineCode: string;
  fileName: string;
  format: 'ZKTECO_CSV' | 'ZKTECO_DAT' | 'ZKTECO_XML' | 'UNKNOWN';
  totalRecords: number;
  dateRange: { from: Date; to: Date } | null;
  sampleRecords: any[];
  warnings: string[];
}

export class ManualImportService {
  constructor(
    private sqlClient: SqlClient,
    private importJobService: ImportJobService,
    private employeeMappingService: EmployeeMappingService,
    private machineRepo: MachineRepository
  ) {}

  /**
   * Detect file format
   */
  detectFormat(content: string, fileName: string): 'ZKTECO_CSV' | 'ZKTECO_DAT' | 'ZKTECO_XML' | 'UNKNOWN' {
    // Check by extension
    const ext = fileName.toLowerCase().split('.').pop();

    if (ext === 'csv') return 'ZKTECO_CSV';
    if (ext === 'dat') return 'ZKTECO_DAT';
    if (ext === 'xml') return 'ZKTECO_XML';

    // Try to detect by content
    const firstLine = content.split('\n')[0].trim();

    // CSV-like format (comma or semicolon separated)
    if (firstLine.includes(',') || firstLine.includes(';')) {
      return 'ZKTECO_CSV';
    }

    // DAT format (tab or space separated, binary-like)
    if (firstLine.includes('\t') || /^\d+\s+\d+/.test(firstLine)) {
      return 'ZKTECO_DAT';
    }

    // XML-like format
    if (firstLine.startsWith('<')) {
      return 'ZKTECO_XML';
    }

    return 'UNKNOWN';
  }

  /**
   * Parse ZKTeco CSV format
   * Expected format: SN,Date,Time,ID,Name,Department,Card,VerifyMode,InOutMode
   */
  parseZKCSV(content: string): ParsedAttendance[] {
    const records: ParsedAttendance[] = [];
    const lines = content.split('\n').filter(l => l.trim());

    // Skip header
    const dataLines = lines.slice(1);

    for (const line of dataLines) {
      const parts = line.split(',').map(p => p.trim().replace(/"/g, ''));

      if (parts.length < 4) continue;

      try {
        const [, date, time, userId] = parts;
        const recordTime = this.parseDateTime(`${date} ${time}`);

        records.push({
          deviceUserId: userId,
          recordTime,
          userSn: parseInt(parts[0]) || 0,
          verifyMode: parseInt(parts[7]) || undefined,
          inOutMode: parseInt(parts[8]) || undefined,
        });
      } catch (e) {
        // Skip invalid lines
      }
    }

    return records;
  }

  /**
   * Parse ZKTeco DAT format
   * Expected format: tabular data with tab or space separation
   */
  parseZKDat(content: string): ParsedAttendance[] {
    const records: ParsedAttendance[] = [];
    const lines = content.split('\n').filter(l => l.trim());

    for (const line of lines) {
      const parts = line.split(/[\t\s]+/).filter(p => p.trim());

      if (parts.length < 3) continue;

      try {
        // Try different patterns
        // Pattern 1: userId timestamp
        // Pattern 2: timestamp userId
        // Pattern 3: userId date time

        let userId: string;
        let dateTimeStr: string;

        if (/^\d+$/.test(parts[0])) {
          // First part is userId
          userId = parts[0];
          dateTimeStr = parts.slice(1).join(' ');
        } else {
          // First part is date/time
          dateTimeStr = parts[0] + ' ' + parts[1];
          userId = parts[2] || parts[parts.length - 1];
        }

        const recordTime = this.parseDateTime(dateTimeStr);

        records.push({
          deviceUserId: userId,
          recordTime,
          userSn: parseInt(parts[0]) || 0,
        });
      } catch (e) {
        // Skip invalid lines
      }
    }

    return records;
  }

  /**
   * Parse date/time string
   */
  private parseDateTime(str: string): Date {
    // Try common formats
    const formats = [
      // YYYY-MM-DD HH:mm:ss
      /^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/,
      // DD/MM/YYYY HH:mm:ss
      /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/,
      // MM/DD/YYYY HH:mm:ss
      /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/,
    ];

    for (const format of formats) {
      const match = str.match(format);
      if (match) {
        if (format === formats[0]) {
          return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]),
                        parseInt(match[4]), parseInt(match[5]), parseInt(match[6]));
        } else if (format === formats[1]) {
          return new Date(parseInt(match[3]), parseInt(match[2]) - 1, parseInt(match[1]),
                        parseInt(match[4]), parseInt(match[5]), parseInt(match[6]));
        } else {
          return new Date(parseInt(match[3]), parseInt(match[1]) - 1, parseInt(match[2]),
                        parseInt(match[4]), parseInt(match[5]), parseInt(match[6]));
        }
      }
    }

    // Try direct parsing
    const date = new Date(str);
    if (!isNaN(date.getTime())) {
      return date;
    }

    throw new Error(`Invalid date format: ${str}`);
  }

  /**
   * Preview import file
   */
  async previewImport(
    content: string,
    fileName: string,
    machineCode: string
  ): Promise<ImportPreview> {
    const format = this.detectFormat(content, fileName);
    const warnings: string[] = [];

    let records: ParsedAttendance[];

    switch (format) {
      case 'ZKTECO_CSV':
        records = this.parseZKCSV(content);
        break;
      case 'ZKTECO_DAT':
        records = this.parseZKDat(content);
        break;
      default:
        warnings.push(`Unknown format. Please upload a ZKTeco export file (CSV, DAT, or XML).`);
        return {
          machineCode,
          fileName,
          format: 'UNKNOWN',
          totalRecords: 0,
          dateRange: null,
          sampleRecords: [],
          warnings,
        };
    }

    // Get date range
    let dateRange: { from: Date; to: Date } | null = null;
    if (records.length > 0) {
      const dates = records.map(r => r.recordTime.getTime());
      dateRange = {
        from: new Date(Math.min(...dates)),
        to: new Date(Math.max(...dates)),
      };
    }

    // Check for unmapped users
    const machine = await this.machineRepo.findByCode(machineCode);
    const mapping = machine ? {
      locCode: machine.loc_code,
      scannerCode: machine.scanner_code,
    } : null;

    for (const record of records.slice(0, 10)) {
      const mapped = await this.employeeMappingService.convertDeviceUserIdToEmpCodeAsync(
        record.deviceUserId,
        mapping?.locCode,
        mapping?.scannerCode,
        machineCode
      );
      if (!mapped) {
        warnings.push(`User ID "${record.deviceUserId}" may not be mapped to employee code`);
      }
    }

    return {
      machineCode,
      fileName,
      format,
      totalRecords: records.length,
      dateRange,
      sampleRecords: records.slice(0, 5),
      warnings,
    };
  }

  /**
   * Import file content
   */
  async importFile(
    content: string,
    fileName: string,
    machineCode: string,
    importedBy: string
  ): Promise<ImportFileResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    let records = 0;

    // Create batch
    const machine = await this.machineRepo.findByCode(machineCode);
    const batchId = await this.importJobService.createImportBatch({
      sync_job_id: undefined,
      source_type: 'MANUAL_USB',
      machine_id: machine?.machine_id,
      source_name: machineCode,
      imported_by: importedBy,
    });

    try {
      const format = this.detectFormat(content, fileName);
      let parsedRecords: ParsedAttendance[];

      switch (format) {
        case 'ZKTECO_CSV':
          parsedRecords = this.parseZKCSV(content);
          break;
        case 'ZKTECO_DAT':
          parsedRecords = this.parseZKDat(content);
          break;
        default:
          errors.push(`Unsupported file format: ${format}`);
          await this.importJobService.completeBatch(batchId, 'FAILED', errors.join('; '));
          return { success: false, records: 0, errors, warnings };
      }

      // Get mapping
      const mapping = machine ? {
        locCode: machine.loc_code,
        scannerCode: machine.scanner_code,
      } : null;

      // Insert records
      for (const record of parsedRecords) {
        try {
          const resolution = resolveRawDeviceUserId(record.deviceUserId, {
            locCode: mapping?.locCode,
            scannerCode: mapping?.scannerCode,
          });
          const empCode = await this.employeeMappingService.convertDeviceUserIdToEmpCodeAsync(
            record.deviceUserId,
            mapping?.locCode,
            mapping?.scannerCode,
            machineCode
          );
          const mappingStatus = empCode ? 'MAPPED' : resolution.mappingStatus;
          const mappingReason = empCode ? empCode.rule : resolution.mappingReason;

          await this.sqlClient.insert('attendance_scan_logs', {
            batch_id: batchId,
            machine_id: machine?.machine_id || 0,
            machine_code: machineCode,
            raw_device_user_id: record.deviceUserId,
            raw_record_time: record.recordTime,
            parsed_employee_code: empCode?.empCode || null,
            parsed_division_code: empCode?.empCode?.[0] ?? null,
            scan_time: record.recordTime,
            scan_date: getWibDateKey(record.recordTime),
            mapping_status: mappingStatus,
            mapping_reason: mappingReason,
            verify_mode: record.verifyMode,
            in_out_mode: record.inOutMode,
            raw_ip: 'MANUAL',
          });

          records++;
        } catch (e: any) {
          if (e.message.includes('duplicate')) {
            warnings.push(`Duplicate skipped: ${record.deviceUserId} at ${record.recordTime}`);
          } else {
            errors.push(`Error importing ${record.deviceUserId}: ${e.message}`);
          }
        }
      }

      // Complete batch
      await this.importJobService.completeBatch(
        batchId,
        errors.length > 0 && records === 0 ? 'FAILED' : 'SUCCESS',
        errors.length > 0 ? errors.slice(0, 5).join('; ') : undefined
      );

      return { success: records > 0, records, errors, warnings };
    } catch (e: any) {
      await this.importJobService.completeBatch(batchId, 'FAILED', e.message);
      errors.push(e.message);
      return { success: false, records, errors, warnings };
    }
  }
}
