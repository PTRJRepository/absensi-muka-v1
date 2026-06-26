// Konfigurasi untuk Database Absensi
// Database: rebinmas_absensi_monitoring (direct connection via mssql)
// Server: 10.0.0.110:1433

export const config = {
  // Database Configuration (Direct Connection)
  // Gunakan mssql.connect() untuk write operations
  database: {
    server: "10.0.0.110",
    port: 1433,
    user: "sa",
    password: process.env.DB_PASSWORD || '<DB_PASSWORD>',
    database: "rebinmas_absensi_monitoring",
  },

  // IT Solution API Configuration
  absensiApi: {
    baseUrl: "http://10.0.0.110:5176",
    apiKey: "<API_KEY>",
  },

  // Sync Configuration
  sync: {
    intervalMinutes: 15,
    batchSize: 100,
    modes: ["hk", "ot"],
  },

  // Divisions for sync
  divisions: [
    "PG1A", "PG1B", "PG2A", "PG2B", "DME", "ARA", "ARB1", "ARB2",
    "INFRA", "AREC", "IJL", "STF-OFFICE", "SECURITY"
  ],
};
