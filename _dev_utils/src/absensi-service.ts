import { sqlClient } from "./sql-client.ts";
import { v4 as uuidv4 } from "uuid";

/**
 * Tipe data untuk absensi
 */
export interface AbsenRecord {
  id?: number;
  emp_code: string;
  emp_name?: string;
  gang_code?: string;
  division: string;
  year: number;
  month: number;
  day: number;
  has_work: boolean;
  is_sunday: boolean;
  is_holiday: boolean;
  holiday_desc?: string;
  is_cuti: boolean;
  is_sakit: boolean;
  task_code?: string;
  ot_hours: number;
  attendance_date: string;
  source?: string;
  created_at?: string;
  updated_at?: string;
}

export interface AbsenVerificationRecord extends AbsenRecord {
  import_id?: number;
  machine_input_id?: number;
  source: "IMPORT" | "MACHINE_INPUT" | "MERGED";
  import_value?: any;
  machine_input_value?: any;
  has_conflict?: boolean;
}

export interface ChangeLogEntry {
  id?: number;
  emp_code: string;
  division: string;
  year: number;
  month: number;
  day: number;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  change_type: "ADD" | "EDIT" | "DELETE";
  source_table: string;
  changed_by?: string;
  changed_at?: string;
}

/**
 * Service untuk mengakses data absensi
 * Aturan:
 * - absen_import: Data dari mesin (IMUTABLE)
 * - absen_machine_input: Data input mesin (BISA di-edit)
 * - absen_verification: Gabungan import + machine input
 */
export class AbsensiService {
  /**
   * ==================== IMPORT (IMUTABLE) ====================
   * Data dari mesin - TIDAK BISA DIEDIT/DIHAPUS
   */

  /**
   * Ambil data import berdasarkan periode
   */
  async getImportData(
    division: string,
    year: number,
    month: number
  ): Promise<AbsenRecord[]> {
    const result = await sqlClient.query(`
      SELECT * FROM absen_import
      WHERE division = '${division}' AND year = ${year} AND month = ${month}
      ORDER BY emp_code, day
    `);
    return result?.recordset || [];
  }

  /**
   * Ambil data import untuk employee tertentu
   */
  async getImportByEmployee(
    empCode: string,
    division: string,
    year: number,
    month: number
  ): Promise<AbsenRecord[]> {
    const result = await sqlClient.query(`
      SELECT * FROM absen_import
      WHERE emp_code = '${empCode}'
        AND division = '${division}'
        AND year = ${year}
        AND month = ${month}
      ORDER BY day
    `);
    return result?.recordset || [];
  }

  /**
   * Insert data import (dari mesin - immutable)
   * Hanya bisa insert data baru, TIDAK BISA UPDATE
   */
  async insertImportBatch(
    records: Omit<AbsenRecord, "id" | "created_at">[],
    division: string,
    year: number,
    month: number,
    importedBy: string = "SYSTEM"
  ): Promise<number> {
    const batchId = uuidv4();

    // Insert batch record
    await sqlClient.execute(`
      INSERT INTO absen_import_batch (batch_id, division, year, month, total_records, status, imported_by)
      VALUES ('${batchId}', '${division}', ${year}, ${month}, ${records.length}, 'IN_PROGRESS', '${importedBy}')
    `);

    let insertedCount = 0;
    const errors: string[] = [];

    for (const record of records) {
      try {
        await sqlClient.execute(`
          INSERT INTO absen_import (
            emp_code, emp_name, gang_code, division, year, month, day,
            has_work, is_sunday, is_holiday, holiday_desc, is_cuti, is_sakit,
            task_code, ot_hours, attendance_date, import_batch_id, source, is_locked
          ) VALUES (
            '${record.emp_code}',
            ${record.emp_name ? `'${record.emp_name}'` : 'NULL'},
            ${record.gang_code ? `'${record.gang_code}'` : 'NULL'},
            '${record.division}',
            ${record.year},
            ${record.month},
            ${record.day},
            ${record.has_work ? 1 : 0},
            ${record.is_sunday ? 1 : 0},
            ${record.is_holiday ? 1 : 0},
            ${record.holiday_desc ? `'${record.holiday_desc}'` : 'NULL'},
            ${record.is_cuti ? 1 : 0},
            ${record.is_sakit ? 1 : 0},
            ${record.task_code ? `'${record.task_code}'` : 'NULL'},
            ${record.ot_hours},
            '${record.attendance_date}',
            '${batchId}',
            'MACHINE',
            1
          )
        `);
        insertedCount++;
      } catch (e: any) {
        errors.push(`${record.emp_code} day ${record.day}: ${e.message}`);
      }
    }

    // Update batch status
    await sqlClient.execute(`
      UPDATE absen_import_batch
      SET status = '${errors.length > 0 ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED'}',
          imported_records = ${insertedCount},
          import_completed_at = GETDATE(),
          error_message = ${errors.length > 0 ? `'${errors.join("; ")}'` : 'NULL'}
      WHERE batch_id = '${batchId}'
    `);

    return insertedCount;
  }

  /**
   * ==================== MACHINE INPUT (BISA DI-EDIT) ====================
   */

  /**
   * Ambil data machine input
   */
  async getMachineInputData(
    division: string,
    year: number,
    month: number
  ): Promise<AbsenRecord[]> {
    const result = await sqlClient.query(`
      SELECT * FROM absen_machine_input
      WHERE division = '${division}' AND year = ${year} AND month = ${month}
      ORDER BY emp_code, day
    `);
    return result?.recordset || [];
  }

  /**
   * Insert atau Update machine input (upsert)
   */
  async upsertMachineInput(
    record: Omit<AbsenRecord, "id" | "created_at" | "updated_at">,
    changedBy?: string
  ): Promise<number> {
    // Check if exists
    const existing = await sqlClient.query(`
      SELECT id FROM absen_machine_input
      WHERE emp_code = '${record.emp_code}'
        AND division = '${record.division}'
        AND year = ${record.year}
        AND month = ${record.month}
        AND day = ${record.day}
    `);

    if (existing?.recordset?.length > 0) {
      // Update
      const oldRecord = await sqlClient.query(`
        SELECT * FROM absen_machine_input
        WHERE id = ${existing.recordset[0].id}
      `);

      // Log changes
      await this.logChange(
        record,
        oldRecord?.recordset?.[0],
        "EDIT",
        "absen_machine_input",
        changedBy
      );

      await sqlClient.execute(`
        UPDATE absen_machine_input SET
          emp_name = ${record.emp_name ? `'${record.emp_name}'` : 'NULL'},
          gang_code = ${record.gang_code ? `'${record.gang_code}'` : 'NULL'},
          has_work = ${record.has_work ? 1 : 0},
          is_sunday = ${record.is_sunday ? 1 : 0},
          is_holiday = ${record.is_holiday ? 1 : 0},
          holiday_desc = ${record.holiday_desc ? `'${record.holiday_desc}'` : 'NULL'},
          is_cuti = ${record.is_cuti ? 1 : 0},
          is_sakit = ${record.is_sakit ? 1 : 0},
          task_code = ${record.task_code ? `'${record.task_code}'` : 'NULL'},
          ot_hours = ${record.ot_hours},
          attendance_date = '${record.attendance_date}',
          updated_at = GETDATE(),
          notes = ${record.notes ? `'${record.notes}'` : 'NULL'}
        WHERE id = ${existing.recordset[0].id}
      `);
      return existing.recordset[0].id;
    } else {
      // Insert
      await sqlClient.execute(`
        INSERT INTO absen_machine_input (
          emp_code, emp_name, gang_code, division, year, month, day,
          has_work, is_sunday, is_holiday, holiday_desc, is_cuti, is_sakit,
          task_code, ot_hours, attendance_date, input_type, created_by
        ) VALUES (
          '${record.emp_code}',
          ${record.emp_name ? `'${record.emp_name}'` : 'NULL'},
          ${record.gang_code ? `'${record.gang_code}'` : 'NULL'},
          '${record.division}',
          ${record.year},
          ${record.month},
          ${record.day},
          ${record.has_work ? 1 : 0},
          ${record.is_sunday ? 1 : 0},
          ${record.is_holiday ? 1 : 0},
          ${record.holiday_desc ? `'${record.holiday_desc}'` : 'NULL'},
          ${record.is_cuti ? 1 : 0},
          ${record.is_sakit ? 1 : 0},
          ${record.task_code ? `'${record.task_code}'` : 'NULL'},
          ${record.ot_hours},
          '${record.attendance_date}',
          'MANUAL',
          ${changedBy ? `'${changedBy}'` : 'NULL'}
        )
      `);

      // Get inserted ID
      const result = await sqlClient.query(`
        SELECT TOP 1 id FROM absen_machine_input
        WHERE emp_code = '${record.emp_code}'
          AND division = '${record.division}'
          AND year = ${record.year}
          AND month = ${record.month}
          AND day = ${record.day}
      `);

      await this.logChange(record, null, "ADD", "absen_machine_input", changedBy);
      return result?.recordset?.[0]?.id || 0;
    }
  }

  /**
   * Delete machine input (hanya machine input yang bisa dihapus)
   */
  async deleteMachineInput(
    empCode: string,
    division: string,
    year: number,
    month: number,
    day: number,
    changedBy?: string
  ): Promise<boolean> {
    const existing = await sqlClient.query(`
      SELECT * FROM absen_machine_input
      WHERE emp_code = '${empCode}'
        AND division = '${division}'
        AND year = ${year}
        AND month = ${month}
        AND day = ${day}
    `);

    if (existing?.recordset?.length > 0) {
      const record: any = {
        emp_code: empCode,
        division,
        year,
        month,
        day,
      };
      await this.logChange(record, existing.recordset[0], "DELETE", "absen_machine_input", changedBy);

      await sqlClient.execute(`
        DELETE FROM absen_machine_input
        WHERE emp_code = '${empCode}'
          AND division = '${division}'
          AND year = ${year}
          AND month = ${month}
          AND day = ${day}
      `);
      return true;
    }
    return false;
  }

  /**
   * ==================== VERIFICATION (GABUNGAN) ====================
   * Menggabungkan data import + machine input
   */

  /**
   * Ambil data verifikasi - gabungan import + machine input
   * Priority: machine_input > import (jika ada di keduanya, machine_input yang berlaku)
   */
  async getVerificationData(
    division: string,
    year: number,
    month: number
  ): Promise<AbsenVerificationRecord[]> {
    const result = await sqlClient.query(`
      SELECT
        COALESCE(m.emp_code, i.emp_code) as emp_code,
        COALESCE(m.emp_name, i.emp_name) as emp_name,
        COALESCE(m.gang_code, i.gang_code) as gang_code,
        COALESCE(m.division, i.division) as division,
        COALESCE(m.year, i.year) as year,
        COALESCE(m.month, i.month) as month,
        COALESCE(m.day, i.day) as day,

        COALESCE(m.has_work, i.has_work) as has_work,
        COALESCE(m.is_sunday, i.is_sunday) as is_sunday,
        COALESCE(m.is_holiday, i.is_holiday) as is_holiday,
        COALESCE(m.holiday_desc, i.holiday_desc) as holiday_desc,
        COALESCE(m.is_cuti, i.is_cuti) as is_cuti,
        COALESCE(m.is_sakit, i.is_sakit) as is_sakit,
        COALESCE(m.task_code, i.task_code) as task_code,
        COALESCE(m.ot_hours, i.ot_hours) as ot_hours,
        COALESCE(m.attendance_date, i.attendance_date) as attendance_date,

        i.id as import_id,
        m.id as machine_input_id,

        CASE WHEN m.id IS NOT NULL THEN 'MACHINE_INPUT'
             WHEN i.id IS NOT NULL THEN 'IMPORT'
             ELSE 'NONE' END as source,

        i.has_work as import_has_work,
        m.has_work as machine_has_work,
        CASE WHEN m.id IS NOT NULL AND i.id IS NOT NULL
             AND m.has_work <> i.has_work THEN 1
             ELSE 0 END as has_conflict

      FROM absen_import i
      FULL OUTER JOIN absen_machine_input m
        ON i.emp_code = m.emp_code
        AND i.division = m.division
        AND i.year = m.year
        AND i.month = m.month
        AND i.day = m.day

      WHERE COALESCE(i.division, m.division) = '${division}'
        AND COALESCE(i.year, m.year) = ${year}
        AND COALESCE(i.month, m.month) = ${month}

      ORDER BY COALESCE(m.emp_code, i.emp_code), COALESCE(m.day, i.day)
    `);

    return result?.recordset || [];
  }

  /**
   * Ambil riwayat perubahan
   */
  async getChangeLog(
    empCode?: string,
    division?: string,
    year?: number,
    month?: number,
    limit: number = 100
  ): Promise<ChangeLogEntry[]> {
    let whereClause = "1=1";
    if (empCode) whereClause += ` AND emp_code = '${empCode}'`;
    if (division) whereClause += ` AND division = '${division}'`;
    if (year) whereClause += ` AND year = ${year}`;
    if (month) whereClause += ` AND month = ${month}`;

    const result = await sqlClient.query(`
      SELECT TOP ${limit} * FROM absen_change_log
      WHERE ${whereClause}
      ORDER BY changed_at DESC
    `);

    return result?.recordset || [];
  }

  /**
   * Log perubahan
   */
  private async logChange(
    newRecord: any,
    oldRecord: any,
    changeType: "ADD" | "EDIT" | "DELETE",
    sourceTable: string,
    changedBy?: string
  ): Promise<void> {
    const fields = [
      "has_work", "is_sunday", "is_holiday", "holiday_desc",
      "is_cuti", "is_sakit", "task_code", "ot_hours"
    ];

    for (const field of fields) {
      const oldValue = oldRecord?.[field];
      const newValue = newRecord[field];

      if (oldValue !== newValue) {
        await sqlClient.execute(`
          INSERT INTO absen_change_log (
            emp_code, division, year, month, day,
            field_name, old_value, new_value,
            change_type, source_table, changed_by
          ) VALUES (
            '${newRecord.emp_code}',
            '${newRecord.division}',
            ${newRecord.year},
            ${newRecord.month},
            ${newRecord.day},
            '${field}',
            ${oldValue !== undefined ? `'${oldValue}'` : 'NULL'},
            ${newValue !== undefined ? `'${newValue}'` : 'NULL'},
            '${changeType}',
            '${sourceTable}',
            ${changedBy ? `'${changedBy}'` : 'NULL'}
          )
        `);
      }
    }
  }

  /**
   * ==================== HELPER METHODS ====================
   */

  /**
   * Ambil semua divisi yang tersedia
   */
  async getDivisions(): Promise<string[]> {
    const result = await sqlClient.query(`
      SELECT DISTINCT division FROM absen_import
      UNION
      SELECT DISTINCT division FROM absen_machine_input
      ORDER BY division
    `);
    return result?.recordset?.map((r: any) => r.division) || [];
  }

  /**
   * Ambil bulan yang tersedia untuk divisi
   */
  async getAvailableMonths(division: string): Promise<{ year: number; month: number }[]> {
    const result = await sqlClient.query(`
      SELECT DISTINCT year, month FROM absen_import
      WHERE division = '${division}'
      UNION
      SELECT DISTINCT year, month FROM absen_machine_input
      WHERE division = '${division}'
      ORDER BY year DESC, month DESC
    `);
    return result?.recordset || [];
  }

  /**
   * Ambil statistik data
   */
  async getStats(division: string, year: number, month: number): Promise<any> {
    const importCount = await sqlClient.query(`
      SELECT COUNT(*) as cnt FROM absen_import
      WHERE division = '${division}' AND year = ${year} AND month = ${month}
    `);

    const machineInputCount = await sqlClient.query(`
      SELECT COUNT(*) as cnt FROM absen_machine_input
      WHERE division = '${division}' AND year = ${year} AND month = ${month}
    `);

    const verificationCount = await sqlClient.query(`
      SELECT COUNT(*) as cnt FROM (
        SELECT 1 as cnt FROM absen_import
        WHERE division = '${division}' AND year = ${year} AND month = ${month}
        UNION ALL
        SELECT 1 as cnt FROM absen_machine_input
        WHERE division = '${division}' AND year = ${year} AND month = ${month}
      ) as combined
    `);

    return {
      importCount: importCount?.recordset?.[0]?.cnt || 0,
      machineInputCount: machineInputCount?.recordset?.[0]?.cnt || 0,
      totalRecords: verificationCount?.recordset?.length || 0,
    };
  }
}

// Export singleton
export const absensiService = new AbsensiService();
