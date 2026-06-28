/**
 * Employee Repository
 *
 * Data access layer for mst_employee table
 */

import { SqlClient } from '../../shared/database/sql-client';

/** Escape single quotes for legacy SqlClient.select (which takes a raw WHERE string).
 * ponytail: SqlClient.select has no parameterization — escape at call site until migrated to mssql @param. */
function sqlStr(value: string): string {
  return value.toString().replace(/'/g, "''");
}

export interface Employee {
  employee_id: number;
  emp_code: string;
  emp_name: string;
  employee_number?: string;
  card_no?: string;
  current_division_id?: number;
  current_gang_id?: number;
  employment_status: string;
  is_active: boolean;
  first_seen_at?: Date;
  last_seen_at?: Date;
  created_at: Date;
  updated_at: Date;
}

export class EmployeeRepository {
  constructor(private sqlClient: SqlClient) {}

  /**
   * Find employee by emp_code
   */
  async findByEmpCode(empCode: string): Promise<Employee | null> {
    const results = await this.sqlClient.select<Employee>(
      'mst_employee',
      '*',
      `emp_code = '${sqlStr(empCode)}'`
    );
    return results[0] || null;
  }

  /**
   * Find employee by ID
   */
  async findById(employeeId: number): Promise<Employee | null> {
    const results = await this.sqlClient.select<Employee>(
      'mst_employee',
      '*',
      `employee_id = ${employeeId}`
    );
    return results[0] || null;
  }

  /**
   * Find employees by division
   */
  async findByDivision(divisionId: number): Promise<Employee[]> {
    return this.sqlClient.select<Employee>(
      'mst_employee',
      '*',
      `current_division_id = ${divisionId} AND is_active = 1`,
      'emp_code'
    );
  }

  /**
   * Create or update employee (upsert)
   */
  async upsert(data: {
    emp_code: string;
    emp_name: string;
    employee_number?: string;
    card_no?: string;
    current_division_id?: number;
    current_gang_id?: number;
  }): Promise<number> {
    const existing = await this.findByEmpCode(data.emp_code);

    if (existing) {
      // Update existing
      await this.sqlClient.update(
        'mst_employee',
        {
          emp_name: data.emp_name,
          employee_number: data.employee_number,
          card_no: data.card_no,
          current_division_id: data.current_division_id,
          current_gang_id: data.current_gang_id,
          last_seen_at: new Date(),
          updated_at: new Date(),
        },
        `emp_code = '${sqlStr(data.emp_code)}'`
      );
      return existing.employee_id;
    } else {
      // Insert new
      return this.sqlClient.insert('mst_employee', {
        ...data,
        employment_status: 'ACTIVE',
        is_active: true,
        first_seen_at: new Date(),
        last_seen_at: new Date(),
      });
    }
  }

  /**
   * Update employee division
   */
  async updateDivision(
    employeeId: number,
    divisionId: number,
    gangId?: number
  ): Promise<void> {
    await this.sqlClient.update(
      'mst_employee',
      {
        current_division_id: divisionId,
        current_gang_id: gangId,
        updated_at: new Date(),
      },
      `employee_id = ${employeeId}`
    );
  }

  /**
   * Update last seen timestamp
   */
  async updateLastSeen(employeeId: number): Promise<void> {
    await this.sqlClient.update(
      'mst_employee',
      { last_seen_at: new Date(), updated_at: new Date() },
      `employee_id = ${employeeId}`
    );
  }

  /**
   * Search employees by name
   */
  async searchByName(name: string): Promise<Employee[]> {
    return this.sqlClient.select<Employee>(
      'mst_employee',
      '*',
      `emp_name LIKE '%${sqlStr(name)}%' AND is_active = 1`,
      'emp_code',
      50
    );
  }

  /**
   * Get all active employees
   */
  async findAllActive(): Promise<Employee[]> {
    return this.sqlClient.select<Employee>(
      'mst_employee',
      '*',
      'is_active = 1',
      'emp_code'
    );
  }

  /**
   * Soft delete employee
   */
  async softDelete(employeeId: number): Promise<void> {
    await this.sqlClient.update(
      'mst_employee',
      {
        is_active: false,
        employment_status: 'INACTIVE',
        updated_at: new Date(),
      },
      `employee_id = ${employeeId}`
    );
  }
}
