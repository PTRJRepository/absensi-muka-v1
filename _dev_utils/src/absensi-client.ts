import { config } from "./config.ts";

/**
 * Absensi API Client
 * Terhubung ke IT Solution Absensi di 10.0.0.110:5176
 */
export class AbsensiApiClient {
  private baseUrl: string;
  private apiKey: string;

  constructor() {
    this.baseUrl = config.absensiApi.baseUrl;
    this.apiKey = config.absensiApi.apiKey;
  }

  private async request<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
    const url = new URL(`${this.baseUrl}${endpoint}`);
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });

    const response = await fetch(url.toString(), {
      headers: {
        "x-api-key": this.apiKey,
      },
    });

    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Ambil semua divisi yang tersedia
   */
  async getDivisions(): Promise<string[]> {
    const result = await this.request<{ success: boolean; data: string[] }>("/api/divisions");
    return result.data;
  }

  /**
   * Ambil bulan yang tersedia untuk suatu divisi
   */
  async getAvailableMonths(division: string): Promise<{ year: number; month: number }[]> {
    const result = await this.request<{ success: boolean; data: { year: number; month: number }[] }>(
      "/api/available-months-by-division",
      { division }
    );
    return result.data;
  }

  /**
   * Ambil data absensi untuk suatu divisi dan periode
   * @param division Divisi (PG1A, PG1B, dll)
   * @param month Bulan (1-12)
   * @param year Tahun
   * @param mode Mode: 'hk' (hari kerja) atau 'ot' (lembur)
   */
  async getAttendance(
    division: string,
    month: number,
    year: number,
    mode: "hk" | "ot" = "hk"
  ): Promise<any[]> {
    const result = await this.request<{ success: boolean; data: any[] }>(
      "/api/attendance-by-division",
      {
        division,
        month: month.toString(),
        year: year.toString(),
        mode,
      }
    );
    return result.data;
  }

  /**
   * Ambil data absensi untuk semua divisi dan bulan terbaru
   */
  async getLatestAttendance(mode: "hk" | "ot" = "hk"): Promise<Map<string, any[]>> {
    const divisions = await this.getDivisions();
    const result = new Map<string, any[]>();

    for (const division of divisions) {
      const months = await this.getAvailableMonths(division);
      if (months.length > 0) {
        // Ambil bulan terbaru
        const latest = months[0];
        const attendance = await this.getAttendance(division, latest.month, latest.year, mode);
        result.set(division, attendance);
      }
    }

    return result;
  }
}

// Export singleton instance
export const absensiApi = new AbsensiApiClient();
