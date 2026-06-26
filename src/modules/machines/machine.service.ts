/**
 * Machine Service
 * 
 * Business logic for machine management
 */

import { MachineRepository, Machine } from './machine.repository';

export interface MachineWithStatus extends Machine {
  is_online?: boolean;
  last_sync?: Date;
  total_users?: number;
  total_logs?: number;
}

export class MachineService {
  constructor(private machineRepo: MachineRepository) {}

  /**
   * Get all machines with status
   */
  async getAllMachines(): Promise<Machine[]> {
    return this.machineRepo.findAll();
  }

  /**
   * Get machine by code
   */
  async getMachineByCode(machineCode: string): Promise<Machine | null> {
    return this.machineRepo.findByCode(machineCode);
  }

  /**
   * Get machines ready for direct import
   */
  async getAccessibleMachines(): Promise<Machine[]> {
    return this.machineRepo.findAccessibleMachines();
  }

  /**
   * Get machines that require API import only
   */
  async getApiOnlyMachines(): Promise<Machine[]> {
    return this.machineRepo.findBySourceType('API_ONLY');
  }

  /**
   * Update machine access status after connection test
   */
  async updateMachineStatus(
    machineCode: string,
    status: 'ACCESSIBLE' | 'UNREACHABLE' | 'PORT_FORWARDING_REQUIRED' | 'NON_ZKTECO',
    note?: string
  ): Promise<void> {
    const machine = await this.machineRepo.findByCode(machineCode);
    if (!machine) {
      throw new Error(`Machine not found: ${machineCode}`);
    }

    await this.machineRepo.updateAccessStatus(machine.machine_id, status, note);
  }

  /**
   * Register new machine
   */
  async registerMachine(data: {
    machine_code: string;
    machine_name: string;
    ip_public: string;
    port: number;
    machine_type?: string;
    source_type?: string;
  }): Promise<number> {
    const machineData: any = {
      ...data,
      machine_type: data.machine_type || 'ZKTECO',
      source_type: data.source_type || 'DIRECT',
      access_status: 'UNKNOWN',
      is_active: true,
    };

    return this.machineRepo.create(machineData);
  }

  /**
   * Get machine connection info for ZKTeco client
   */
  async getMachineConnectionInfo(machineCode: string): Promise<{
    ip: string;
    port: number;
    timeout: number;
  } | null> {
    const machine = await this.machineRepo.findByCode(machineCode);
    if (!machine) return null;

    // Prefer local IP if available, fallback to public
    const ip = machine.ip_local || machine.ip_public;
    if (!ip) return null;

    return {
      ip,
      port: machine.port,
      timeout: 30000, // 30 seconds default
    };
  }

  /**
   * Get scanner code mapping for deviceUserId conversion
   */
  async getScannerCodeMapping(machineCode: string): Promise<{
    scannerCode?: number;
    locCode?: string;
  } | null> {
    const machine = await this.machineRepo.findByCode(machineCode);
    if (!machine) return null;

    return {
      scannerCode: machine.scanner_code || undefined,
      locCode: machine.loc_code || undefined,
    };
  }

  /**
   * Validate machine configuration
   */
  async validateMachineConfig(machineCode: string): Promise<{
    valid: boolean;
    errors: string[];
  }> {
    const machine = await this.machineRepo.findByCode(machineCode);
    const errors: string[] = [];

    if (!machine) {
      return { valid: false, errors: ['Machine not found'] };
    }

    if (!machine.ip_local && !machine.ip_public) {
      errors.push('No IP address configured');
    }

    if (!machine.port) {
      errors.push('No port configured');
    }

    if (machine.source_type === 'DIRECT' && machine.access_status === 'UNREACHABLE') {
      errors.push('Machine marked as DIRECT but unreachable');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
