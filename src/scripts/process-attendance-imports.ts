/**
 * Process attendance imports from scan_logs → attendance_imports
 * Run: node dist/scripts/process-attendance-imports.js
 *
 * This script calls AttendanceProcessService.processAllUnprocessed()
 * which correctly:
 * - Inserts MAPPED records with enrichment columns
 * - Routes NEED_REVIEW records to MANUAL_REVIEW (deduplicated)
 * - Uses NIK-based current_emp_code resolution
 *
 * This replaces the old rebuild-attendance-imports.js which:
 * - Did not include enrichment columns in INSERT
 * - Created duplicate MANUAL_REVIEW entries on every run
 */

import { attendanceProcessService } from '../modules/attendance/attendance-process-import.service';

async function main() {
  console.log('=== Attendance Import Processor ===');
  console.log(`Started: ${new Date().toISOString()}`);

  const BATCH_SIZE = 1000;
  let totalProcessed = 0;
  let totalErrors = 0;
  let batch = 0;

  while (true) {
    batch++;
    const result = await attendanceProcessService.processAllUnprocessed(BATCH_SIZE);

    if (!result.success) {
      console.error(`Batch ${batch} FAILED:`, result.errors);
      totalErrors += result.errors;
      break;
    }

    totalProcessed += result.processed;
    console.log(`Batch ${batch}: +${result.processed} processed (mapped=${result.details?.mapped ?? 0}, manual_review=${result.details?.manualReview ?? 0})`);

    // Stop when no more records to process
    if (result.processed === 0) {
      break;
    }
  }

  console.log(`\n=== DONE ===`);
  console.log(`Total processed: ${totalProcessed}`);
  console.log(`Total errors: ${totalErrors}`);

  const counts = await attendanceProcessService.getImportCount();
  console.log(`Total attendance_imports rows: ${counts}`);
}

main().catch((err: unknown) => {
  console.error('Fatal:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
