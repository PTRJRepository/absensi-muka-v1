/**
 * SQL Gateway HTTP Client
 * 
 * Connects to SQL Server via HTTP Gateway at http://10.0.0.110:8001/v1/query
 * Server: SERVER_PROFILE_1
 * Database: extend_db_ptrj
 */

export interface SqlQueryRequest {
  sql: string;
  server: string;
  db: string;
}

export interface SqlQueryResponse<T = any> {
  success: boolean;
  data?: T[];
  error?: string;
}

export class SqlClient {
  private readonly gatewayUrl: string;
  private readonly apiKey: string;
  private readonly server: string;
  private readonly database: string;

  constructor(
    gatewayUrl: string,
    apiKey: string,
    server: string = 'SERVER_PROFILE_1',
    database: string = 'extend_db_ptrj'
  ) {
    this.gatewayUrl = gatewayUrl;
    this.apiKey = apiKey;
    this.server = server;
    this.database = database;
  }

  /**
   * Execute SQL query via HTTP Gateway
   */
  async query<T = any>(sql: string): Promise<T[]> {
    const request: SqlQueryRequest = {
      sql,
      server: this.server,
      db: this.database,
    };

    const response = await fetch(this.gatewayUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
      },
      body: JSON.stringify(request),
    });

    const result: SqlQueryResponse<T> = (await response.json()) as SqlQueryResponse<T>;

    if (!result.success) {
      throw new Error(`SQL Error: ${result.error}`);
    }

    return result.data || [];
  }

  /**
   * Execute INSERT and return inserted ID
   */
  async insert(table: string, data: Record<string, any>): Promise<number> {
    const columns = Object.keys(data).join(', ');
    const values = Object.values(data)
      .map((v) => this.escapeValue(v))
      .join(', ');

    const sql = `
      INSERT INTO ${table} (${columns})
      OUTPUT INSERTED.${this.getIdColumn(table)}
      VALUES (${values})
    `;

    const result = await this.query<{ id: number }>(sql);
    return result[0]?.id || 0;
  }

  /**
   * Execute batch INSERT
   */
  async batchInsert(table: string, dataArray: Record<string, any>[]): Promise<number> {
    if (dataArray.length === 0) return 0;

    const columns = Object.keys(dataArray[0]).join(', ');
    const valueRows = dataArray
      .map((data) => {
        const values = Object.values(data)
          .map((v) => this.escapeValue(v))
          .join(', ');
        return `(${values})`;
      })
      .join(', ');

    const sql = `INSERT INTO ${table} (${columns}) VALUES ${valueRows}`;
    await this.query(sql);
    return dataArray.length;
  }

  /**
   * Execute UPDATE
   */
  async update(
    table: string,
    data: Record<string, any>,
    where: string
  ): Promise<number> {
    const setClause = Object.entries(data)
      .map(([key, value]) => `${key} = ${this.escapeValue(value)}`)
      .join(', ');

    const sql = `UPDATE ${table} SET ${setClause} WHERE ${where}`;
    await this.query(sql);
    return 1; // SQL Server doesn't return affected rows via this gateway
  }

  /**
   * Execute DELETE
   */
  async delete(table: string, where: string): Promise<number> {
    const sql = `DELETE FROM ${table} WHERE ${where}`;
    await this.query(sql);
    return 1;
  }

  /**
   * Execute SELECT with WHERE clause
   */
  async select<T = any>(
    table: string,
    columns: string = '*',
    where?: string | null,
    orderBy?: string,
    limit?: number
  ): Promise<T[]> {
    let sql = `SELECT ${limit ? `TOP ${limit}` : ''} ${columns} FROM ${table}`;
    if (where) sql += ` WHERE ${where}`;
    if (orderBy) sql += ` ORDER BY ${orderBy}`;

    return this.query<T>(sql);
  }

  /**
   * Escape SQL value
   */
  private escapeValue(value: any): string {
    if (value === null || value === undefined) return 'NULL';
    if (typeof value === 'number') return value.toString();
    if (typeof value === 'boolean') return value ? '1' : '0';
    if (value instanceof Date) return `'${value.toISOString()}'`;
    
    // Escape single quotes
    const escaped = value.toString().replace(/'/g, "''");
    return `'${escaped}'`;
  }

  /**
   * Get primary key column name for table
   */
  private getIdColumn(table: string): string {
    const idMap: Record<string, string> = {
      mst_estate: 'estate_id',
      mst_division: 'division_id',
      mst_gang: 'gang_id',
      mst_machine: 'machine_id',
      mst_employee: 'employee_id',
      employee_division_history: 'history_id',
      employee_daily_assignment: 'assignment_id',
      sync_job: 'sync_job_id',
      import_batch: 'import_batch_id',
      attendance_raw_log: 'raw_log_id',
      machine_user_raw: 'machine_user_raw_id',
      api_attendance_raw: 'api_raw_id',
      machine_user_map: 'map_id',
      attendance_daily_process: 'process_id',
      attendance_process_detail: 'detail_id',
      attendance_division_reconcile: 'reconcile_id',
      attendance_manual_adjustment: 'adjustment_id',
      attendance_anomaly: 'anomaly_id',
      monitoring_daily_summary: 'summary_id',
      audit_log: 'audit_id',
      app_config: 'config_id',
    };

    return idMap[table] || 'id';
  }
}
