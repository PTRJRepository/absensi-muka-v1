import { requestData } from './api-client';
import type { EmployeeDetail } from '../types';

/**
 * Employee Detail API Service
 * Provides endpoints for getting employee detail with code history
 */
export const employeeDetailApi = {
  /**
   * Get employee detail by ID (numeric employee ID)
   */
  async getById(id: number) {
    const response = await requestData<EmployeeDetail>(
      `/api/employees/${id}/detail?idType=id`
    );
    return response;
  },

  /**
   * Get employee detail by NIK
   */
  async getByNik(nik: string) {
    const normalizedNik = nik.trim().replace(/\s+/g, '');
    const response = await requestData<EmployeeDetail>(
      `/api/employees/by-nik/${encodeURIComponent(normalizedNik)}`
    );
    return response;
  },

  /**
   * Get employee detail with code history
   * Auto-detects ID type based on format
   */
  async getDetail(identifier: string | number) {
    if (typeof identifier === 'number') {
      return this.getById(identifier);
    }
    // Check if it looks like a NIK (mostly numeric, longer than 5 chars)
    const normalized = identifier.trim().replace(/\s+/g, '');
    if (/^\d{6,}$/.test(normalized)) {
      return this.getByNik(normalized);
    }
    // Otherwise treat as employee code by ID lookup
    return this.getByNik(normalized);
  },
};

// TanStack Query key factory for cache management
export const employeeDetailKeys = {
  all: ['employee-detail'] as const,
  byId: (id: number) => [...employeeDetailKeys.all, 'id', id] as const,
  byNik: (nik: string) => [...employeeDetailKeys.all, 'nik', nik] as const,
  byIdentifier: (identifier: string | number) =>
    [...employeeDetailKeys.all, 'identifier', String(identifier)] as const,
};
