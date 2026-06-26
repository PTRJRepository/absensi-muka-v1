/**
 * Quality Dashboard API
 * GET /api/quality/dashboard-summary
 * GET /api/quality/daily-trend
 */

import { route } from "../router";
import { sendJson } from "../response";
import { query } from "../../lib/db";

// GET /api/quality/dashboard-summary
route("GET", "/api/quality/dashboard-summary", async (ctx) => {
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const sinceStr = since.toISOString().split("T")[0];

  const [[totals], topUnmapped] = await Promise.all([
    query<any>(`
      SELECT
        COUNT(*) AS total_records,
        SUM(CASE WHEN mapping_status = 'MAPPED' THEN 1 ELSE 0 END) AS mapped,
        SUM(CASE WHEN mapping_status = 'UNMAPPED' THEN 1 ELSE 0 END) AS unmapped,
        SUM(CASE WHEN mapping_status = 'NEED_REVIEW' THEN 1 ELSE 0 END) AS need_review,
        SUM(CASE WHEN scan_date = CAST(GETDATE() AS DATE) THEN 1 ELSE 0 END) AS today_scans
      FROM attendance_scan_logs
      WHERE scan_date >= @since
    `, [{ name: "since", type: "NVarChar", value: sinceStr }]),
    query<any>(`
      SELECT TOP 10
        raw_device_user_id,
        COUNT(*) AS occurrence_count,
        MAX(scan_time) AS last_seen,
        STRING_AGG(DISTINCT machine_code, ", ") AS machines
      FROM attendance_scan_logs
      WHERE mapping_status != 'MAPPED'
      GROUP BY raw_device_user_id
      ORDER BY occurrence_count DESC
    `)
  ]);

  const total = Number(totals.total_records ?? 0);
  const mapped = Number(totals.mapped ?? 0);
  const unmapped = Number(totals.unmapped ?? 0);
  const need_review = Number(totals.need_review ?? 0);
  const mappedPct = total > 0 ? Math.round((mapped / total) * 100) : 0;

  const score = mappedPct;
  const grade = score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 60 ? "D" : "F";

  sendJson(ctx.res, 200, {
    overall_health: {
      score,
      grade,
      trend: "stable",
      total_records: total,
      today_scans: Number(totals.today_scans ?? 0)
    },
    mapping: {
      total_records: total,
      mapped,
      unmapped,
      need_review,
      mapped_percentage: mappedPct
    },
    top_unmapped: topUnmapped.map((r: any) => ({
      raw_id: r.raw_device_user_id,
      occurrence_count: Number(r.occurrence_count),
      last_seen: r.last_seen,
      machines: r.machines ?? ""
    })),
    issues: []
  });
});

// GET /api/quality/daily-trend
route("GET", "/api/quality/daily-trend", async (ctx) => {
  const days = parseInt(ctx.query.get("days") ?? "30");
  const from = new Date();
  from.setDate(from.getDate() - days);
  const fromStr = from.toISOString().split("T")[0];
  const toStr = new Date().toISOString().split("T")[0];

  const rows = await query<any>(`
    SELECT
      scan_date,
      COUNT(*) AS total_scans,
      COUNT(DISTINCT parsed_employee_code) AS unique_employees,
      COUNT(DISTINCT machine_code) AS machines_active,
      SUM(CASE WHEN mapping_status = 'MAPPED' THEN 1 ELSE 0 END) AS mapped_scans,
      SUM(CASE WHEN mapping_status != 'MAPPED' THEN 1 ELSE 0 END) AS unmapped_scans
    FROM attendance_scan_logs
    WHERE scan_date >= @from AND scan_date <= @to
    GROUP BY scan_date
    ORDER BY scan_date ASC
  `, [{ name: "from", type: "NVarChar", value: fromStr }, { name: "to", type: "NVarChar", value: toStr }]);

  const labels: string[] = [];
  const totalData: number[] = [];
  const mappedData: number[] = [];

  for (const r of rows) {
    labels.push(String(r.scan_date).substring(0, 10));
    totalData.push(Number(r.total_scans));
    mappedData.push(Number(r.mapped_scans));
  }

  sendJson(ctx.res, 200, {
    labels,
    datasets: [
      { label: "Total Scans", data: totalData, borderColor: "#167A3A", backgroundColor: "rgba(22,122,58,0.1)", fill: true },
      { label: "Mapped", data: mappedData, borderColor: "#219653", backgroundColor: "rgba(33,150,83,0.1)", fill: true }
    ],
    raw: rows
  });
});
