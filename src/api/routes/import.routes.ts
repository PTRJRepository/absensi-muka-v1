/**
 * Manual Import API Routes
 *
 * Endpoints for manual/USB file import
 * Part of Phase 5: Advanced Features
 */

import { route } from '../router';
import { ManualImportService } from '../../modules/import/manual-import.service';
import { SqlClient } from '../../shared/database/sql-client';
import { ImportJobService } from '../../modules/import/import-job.service';
import { EmployeeMappingService } from '../../modules/employees/employee-mapping.service';
import { MachineRepository } from '../../modules/machines/machine.repository';

// Initialize services
const sqlClient = new SqlClient(
  process.env.GATEWAY_URL || 'http://10.0.0.110:8001/v1/query',
  process.env.GATEWAY_API_KEY || ''
);

const importJobService = new ImportJobService(sqlClient);
const employeeMappingService = new EmployeeMappingService(sqlClient);
const machineRepo = new MachineRepository(sqlClient);
const manualImportService = new ManualImportService(
  sqlClient,
  importJobService,
  employeeMappingService,
  machineRepo
);

/**
 * POST /api/import/preview
 * Preview import file before committing
 */
route('POST', '/api/import/preview', async (ctx) => {
  const body = ctx.body as {
    content: string;
    fileName: string;
    machineCode: string;
  };

  if (!body.content || !body.fileName || !body.machineCode) {
    ctx.res.writeHead(400, { 'Content-Type': 'application/json' });
    ctx.res.end(JSON.stringify({
      success: false,
      error: 'Missing required fields: content, fileName, machineCode',
    }));
    return;
  }

  const preview = await manualImportService.previewImport(
    body.content,
    body.fileName,
    body.machineCode
  );

  ctx.res.writeHead(200, { 'Content-Type': 'application/json' });
  ctx.res.end(JSON.stringify({
    success: true,
    data: preview,
  }));
});

/**
 * POST /api/import/upload
 * Import file content
 */
route('POST', '/api/import/upload', async (ctx) => {
  const body = ctx.body as {
    content: string;
    fileName: string;
    machineCode: string;
    importedBy?: string;
  };

  if (!body.content || !body.fileName || !body.machineCode) {
    ctx.res.writeHead(400, { 'Content-Type': 'application/json' });
    ctx.res.end(JSON.stringify({
      success: false,
      error: 'Missing required fields: content, fileName, machineCode',
    }));
    return;
  }

  const result = await manualImportService.importFile(
    body.content,
    body.fileName,
    body.machineCode,
    body.importedBy || 'SYSTEM'
  );

  ctx.res.writeHead(result.success ? 200 : 400, { 'Content-Type': 'application/json' });
  ctx.res.end(JSON.stringify({
    success: result.success,
    data: {
      recordsImported: result.records,
      errors: result.errors,
      warnings: result.warnings,
    },
  }));
});

/**
 * GET /api/import/formats
 * Get supported import formats
 */
route('GET', '/api/import/formats', async (ctx) => {
  const formats = [
    {
      id: 'ZKTECO_CSV',
      name: 'ZKTeco CSV',
      description: 'Comma-separated values export from ZKTeco software',
      extensions: ['.csv'],
      example: 'SN,Date,Time,ID,Name,Department,Card,VerifyMode,InOutMode',
    },
    {
      id: 'ZKTECO_DAT',
      name: 'ZKTeco DAT',
      description: 'Tab or space-separated export format',
      extensions: ['.dat', '.txt'],
      example: '1234\t2024-01-15\t08:30:00\t10044',
    },
    {
      id: 'ZKTECO_XML',
      name: 'ZKTeco XML',
      description: 'XML export format',
      extensions: ['.xml'],
      example: '<Record><UserID>10044</UserID><DateTime>2024-01-15 08:30:00</DateTime></Record>',
    },
  ];

  ctx.res.writeHead(200, { 'Content-Type': 'application/json' });
  ctx.res.end(JSON.stringify({
    success: true,
    data: formats,
  }));
});
