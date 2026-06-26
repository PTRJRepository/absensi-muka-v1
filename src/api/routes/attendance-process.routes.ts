import { route } from "../router";
import { sendJson } from "../response";
import { attendanceProcessService } from "../../modules/attendance/attendance-process-import.service";

route("GET", "/api/attendance/import-count", async (ctx) => {
  const importCount = await attendanceProcessService.getImportCount();
  const scanLogCount = await attendanceProcessService.getScanLogCount();
  const manualReviewCount = await attendanceProcessService.getManualReviewCount();
  sendJson(ctx.res, 200, {
    attendanceImports: importCount,
    attendanceScanLogs: scanLogCount,
    manualReviewImports: manualReviewCount,
    pending: scanLogCount - importCount,
  });
});

route("POST", "/api/attendance/process-scan-logs", async (ctx) => {
  const batchId = ctx.query.get("batchId");
  const batchIdNum = batchId ? parseInt(batchId) : 0;
  const result = await attendanceProcessService.processScanLogsForBatch(batchIdNum);
  sendJson(ctx.res, 200, result);
});

route("POST", "/api/attendance/process-all-scan-logs", async (ctx) => {
  const batchSize = ctx.query.get("batchSize");
  const batchSizeNum = batchSize ? parseInt(batchSize) : 1000;
  const result = await attendanceProcessService.processAllUnprocessed(batchSizeNum);
  sendJson(ctx.res, 200, result);
});
