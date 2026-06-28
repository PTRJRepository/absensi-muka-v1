// Use relative path so Vite proxy (/api → localhost:8004) works in dev
// In production, nginx rewrites /api → backend
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

export function getToken() { return localStorage.getItem('token'); }
export function setToken(token: string) { localStorage.setItem('token', token); }
export function clearToken() { localStorage.removeItem('token'); }

interface ApiErrorResponse {
  success: false;
  error: string;
  message?: string;
}

interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  message?: string;
}

type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
      ...(options.headers ?? {}),
    },
  });

  // Read body first so error detail is available (was thrown before body read)
  const text = await response.text();

  if (response.status === 401) {
    clearToken();
    if (typeof window !== 'undefined') window.location.reload();
    throw new Error('Sesi berakhir, silakan login kembali');
  }

  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    if (text) {
      try {
        const p = JSON.parse(text);
        const msg = (p as ApiErrorResponse)?.error ?? (p as ApiErrorResponse)?.message;
        if (msg) detail = msg;
      } catch { /* non-JSON error body, keep status detail */ }
    }
    throw new Error(detail);
  }

  if (!text) {
    // Return null for empty responses instead of empty array
    return null as T;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`Invalid JSON response from ${path}`);
  }

  // Handle wrapped responses: { success: true, data: [...] }
  if (
    typeof payload === 'object' &&
    payload !== null &&
    'success' in payload
  ) {
    const p = payload as ApiResponse<T>;
    if (!p.success) {
      const errorMessage = 'error' in p ? (p as ApiErrorResponse).error : 'API error';
      throw new Error(errorMessage);
    }
    return (p as ApiSuccessResponse<T>).data;
  }

  // Handle raw array / object responses (no wrapper)
  return payload as T;
}

// Helper for downloading files (non-JSON responses)
export async function downloadFile(path: string, filename: string): Promise<void> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}

// === Machine Detail API Functions ===
// DUAL MODE: These endpoints support TWO view modes:
// - "Data Mesin" (blue): Shows raw device_uid from machine
// - "Database" (green): Shows mapped employee data

/**
 * Get all users for a machine - contains BOTH raw and mapped data
 * - machine_raw[]: For "Data Mesin" toggle
 * - database_mapped[]: For "Database" toggle (mapped users)
 * - unmapped[]: For "Database" toggle (unmapped users)
 */
export async function getMachineEmployees(machineCode: string): Promise<import('../types').MachineEmployeesResponse> {
  return api<import('../types').MachineEmployeesResponse>(`/api/monitoring/machine/${machineCode}/employees`);
}

/**
 * Get raw scan logs (attendance records) from a machine
 * Supports pagination for large datasets
 */
export async function getMachineRawScanLogs(
  machineCode: string,
  options?: {
    page?: number;
    limit?: number;
    filter?: 'all' | 'mapped' | 'unmapped';
  }
): Promise<import('../types').RawScanLogsResponse> {
  const params = new URLSearchParams();
  if (options?.page) params.set('page', String(options.page));
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.filter) params.set('filter', options.filter);

  const query = params.toString();
  return api<import('../types').RawScanLogsResponse>(
    `/api/monitoring/machine/${machineCode}/raw-data${query ? `?${query}` : ''}`
  );
}

/**
 * Get employee attendance history by employee code
 */
export async function getEmployeeAttendance(employeeCode: string, options?: {
  limit?: number;
}): Promise<any[]> {
  const params = new URLSearchParams();
  if (options?.limit) params.set('limit', String(options.limit));

  const query = params.toString();
  return api<any[]>(
    `/api/attendance/employee/${employeeCode}${query ? `?${query}` : ''}`
  );
}

/**
 * Get raw scan logs by raw_device_user_id and machine
 */
export async function getUserScanLogsByRawId(
  machineCode: string,
  rawDeviceUserId: string,
  options?: {
    limit?: number;
  }
): Promise<any[]> {
  const params = new URLSearchParams({ rawDeviceUserId });
  if (options?.limit) params.set('limit', String(options.limit));

  return api<any[]>(
    `/api/attendance/employee/${rawDeviceUserId}/raw?${params.toString()}`
  );
}

/**
 * Get user attendance history from a specific machine
 * Returns aggregated attendance by date with check-in/check-out times
 */
export async function getMachineUserAttendance(
  machineCode: string,
  rawDeviceUserId: string,
  options?: {
    limit?: number;
  }
): Promise<{
  machine_code: string;
  raw_id: string;
  user: any;
  employee_name: string | null;
  attendance: Array<{
    date: string;
    first_scan: string;
    last_scan: string;
    scan_count: number;
    parsed_employee_code: string | null;
    mapping_status: string;
    mapping_reason: string | null;
    event_type: string | null;
    verify_type: string | null;
    status: 'HADIR' | 'NO_CHECKOUT' | 'TIDAK_HADIR';
  }>;
}> {
  const params = new URLSearchParams();
  if (options?.limit) params.set('limit', String(options.limit));

  return api(
    `/api/monitoring/machine/${machineCode}/user/${rawDeviceUserId}/attendance${params.toString() ? `?${params.toString()}` : ''}`
  );
}
