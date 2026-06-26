/**
 * Machine Repository
 * 
 * Data access layer for mst_machine table
 */

import { SqlClient } from '../../shared/database/sql-client';

export interface Machine {
  machine_id: number;
  machine_code: string;
  machine_name: string;
  estate_id?: number;
  default_division_id?: number;
  ip_local?: string;
  ip_public?: string;
  port: number;
  scanner_code?: number;
  loc_code?: string;
  machine_type: string;
  source_type: string;
  data_source: 'DIRECT_ZKTECO';
  access_status: string;
  access_note?: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export class MachineRepository {
  constructor(private sqlClient: SqlClient) {}

  /**
   * Get all active machines
   */
  async findAll(): Promise<Machine[]> {
    return this.sqlClient.select<Machine>(
      'mst_machine',
      '*',
      'is_active = 1',
      'machine_code'
    );
  }

  /**
   * Get machine by ID
   */
  async findById(machineId: number): Promise<Machine | null> {
    const results = await this.sqlClient.select<Machine>(
      'mst_machine',
      '*',
      `machine_id = ${machineId}`
    );
    return results[0] || null;
  }

  /**
   * Get machine by code
   */
  async findByCode(machineCode: string): Promise<Machine | null> {
    const results = await this.sqlClient.select<Machine>(
      'mst_machine',
      '*',
      `machine_code = '${machineCode}'`
    );
    return results[0] || null;
  }

  /**
   * Get machines by source type
   */
  async findBySourceType(sourceType: string): Promise<Machine[]> {
    return this.sqlClient.select<Machine>(
      'mst_machine',
      '*',
      `source_type = '${sourceType}' AND is_active = 1`,
      'machine_code'
    );
  }

  /**
   * Get machines by access status
   */
  async findByAccessStatus(accessStatus: string): Promise<Machine[]> {
    return this.sqlClient.select<Machine>(
      'mst_machine',
      '*',
      `access_status = '${accessStatus}' AND is_active = 1`,
      'machine_code'
    );
  }

  /**
   * Get accessible machines (for direct ZKTeco import)
   */
  async findAccessibleMachines(): Promise<Machine[]> {
    return this.sqlClient.select<Machine>(
      'mst_machine',
      '*',
      `access_status = 'ACCESSIBLE' AND source_type IN ('DIRECT', 'DIRECT_AND_API') AND is_active = 1`,
      'machine_code'
    );
  }

  /**
   * Create new machine
   */
  async create(data: Omit<Machine, 'machine_id' | 'created_at' | 'updated_at'>): Promise<number> {
    return this.sqlClient.insert('mst_machine', data);
  }

  /**
   * Update machine
   */
  async update(machineId: number, data: Partial<Machine>): Promise<void> {
    await this.sqlClient.update('mst_machine', data, `machine_id = ${machineId}`);
  }

  /**
   * Update access status
   */
  async updateAccessStatus(machineId: number, status: string, note?: string): Promise<void> {
    const data: any = {
      access_status: status,
      updated_at: new Date(),
    };
    if (note) data.access_note = note;

    await this.sqlClient.update('mst_machine', data, `machine_id = ${machineId}`);
  }

  /**
   * Soft delete machine
   */
  async softDelete(machineId: number): Promise<void> {
    await this.sqlClient.update(
      'mst_machine',
      { is_active: false, updated_at: new Date() },
      `machine_id = ${machineId}`
    );
  }
}
