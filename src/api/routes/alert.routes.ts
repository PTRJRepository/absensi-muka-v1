/**
 * Alert API Routes
 *
 * Simplified alert management using local database
 */

import { route } from "../router";
import { sendJson } from "../response";
import { query, sql, execute } from "../../lib/db";

export const DEFAULT_ALERT_RULES = [
  { name: "High Unmapped Employees", checkType: "UNMAPPED_EMPLOYEES", condition: "GT", threshold: 50, severity: "WARNING", channels: ["DASHBOARD"], enabled: true },
  { name: "Critical Unmapped Employees", checkType: "UNMAPPED_EMPLOYEES", condition: "GT", threshold: 200, severity: "CRITICAL", channels: ["DASHBOARD"], enabled: true },
  { name: "High Duplicate Scans", checkType: "DUPLICATE_SCANS", condition: "GT", threshold: 500, severity: "WARNING", channels: ["DASHBOARD"], enabled: true },
  { name: "Unprocessed Logs Backlog", checkType: "UNPROCESSED_LOGS", condition: "GT", threshold: 5000, severity: "CRITICAL", channels: ["DASHBOARD"], enabled: true },
  { name: "Machine Time Drift", checkType: "MACHINE_TIME_DRIFT", condition: "GT", threshold: 0, severity: "WARNING", channels: ["DASHBOARD"], enabled: true },
];

/**
 * GET /api/alerts/rules
 */
route("GET", "/api/alerts/rules", async (ctx) => {
  try {
    const rules = await query<any>(`
      SELECT id, config_key as name, config_value as rule_data, is_sensitive
      FROM app_configs WHERE config_key LIKE 'ALERT:%'
    `);
    const formattedRules = rules.map((r: any) => ({
      id: r.id,
      name: r.name,
      ...JSON.parse(r.rule_data || "{}"),
      enabled: r.is_sensitive === 0
    }));
    ctx.res.writeHead(200, { "Content-Type": "application/json" });
    ctx.res.end(JSON.stringify({ success: true, data: formattedRules }));
  } catch (e: any) {
    ctx.res.writeHead(200, { "Content-Type": "application/json" });
    ctx.res.end(JSON.stringify({ success: true, data: [] }));
  }
});

/**
 * POST /api/alerts/rules
 */
route("POST", "/api/alerts/rules", async (ctx) => {
  const body = ctx.body as any;
  if (!body?.name) {
    ctx.res.writeHead(400, { "Content-Type": "application/json" });
    ctx.res.end(JSON.stringify({ success: false, error: "Name required" }));
    return;
  }
  try {
    const id = Date.now();
    await execute(
      `INSERT INTO app_configs (config_key, config_value, is_sensitive) VALUES (@key, @value, @active)`,
      [
        { name: "key", type: sql.NVarChar, value: "ALERT:" + body.name },
        { name: "value", type: sql.NVarChar, value: JSON.stringify(body) },
        { name: "active", type: sql.Int, value: body.enabled !== false ? 0 : 1 }
      ]
    );
    ctx.res.writeHead(201, { "Content-Type": "application/json" });
    ctx.res.end(JSON.stringify({ success: true, data: { id } }));
  } catch (e: any) {
    ctx.res.writeHead(200, { "Content-Type": "application/json" });
    ctx.res.end(JSON.stringify({ success: false, error: e.message }));
  }
});

/**
 * PUT /api/alerts/rules/:id
 */
route("PUT", "/api/alerts/rules/:id", async (ctx) => {
  const { id } = ctx.params;
  const body = ctx.body as any;
  try {
    const ruleData = body ? JSON.stringify(body) : "{}";
    await execute(
      `UPDATE app_configs SET config_value = @value, is_sensitive = @active WHERE id = @id AND config_key LIKE 'ALERT:%'`,
      [
        { name: "id", type: sql.Int, value: parseInt(id) },
        { name: "value", type: sql.NVarChar, value: ruleData },
        { name: "active", type: sql.Int, value: body?.enabled !== false ? 0 : 1 }
      ]
    );
    ctx.res.writeHead(200, { "Content-Type": "application/json" });
    ctx.res.end(JSON.stringify({ success: true, message: "Rule updated" }));
  } catch (e: any) {
    ctx.res.writeHead(200, { "Content-Type": "application/json" });
    ctx.res.end(JSON.stringify({ success: false, error: e.message }));
  }
});

/**
 * DELETE /api/alerts/rules/:id
 */
route("DELETE", "/api/alerts/rules/:id", async (ctx) => {
  const { id } = ctx.params;
  try {
    await execute(
      `UPDATE app_configs SET is_sensitive = 1 WHERE id = @id AND config_key LIKE 'ALERT:%'`,
      [{ name: "id", type: sql.Int, value: parseInt(id) }]
    );
    ctx.res.writeHead(200, { "Content-Type": "application/json" });
    ctx.res.end(JSON.stringify({ success: true, message: "Rule disabled" }));
  } catch (e: any) {
    ctx.res.writeHead(200, { "Content-Type": "application/json" });
    ctx.res.end(JSON.stringify({ success: false, error: e.message }));
  }
});

/**
 * POST /api/alerts/run
 */
route("POST", "/api/alerts/run", async (ctx) => {
  const alerts = [];
  try {
    const unmappedCount = await query<any>(`SELECT COUNT(*) as cnt FROM attendance_raw r JOIN scan_map sm ON sm.scan_log_id = r.id WHERE sm.map_status != 'MAPPED'`);
    if (unmappedCount[0]?.cnt > 50) {
      alerts.push({ title: "Warning: High Unmapped Employees", severity: "WARNING", message: `${unmappedCount[0].cnt} unmapped employees found` });
    }
  } catch (e) {
    console.error('[alerts/run] Failed to check unmapped count:', e);
  }
  ctx.res.writeHead(200, { "Content-Type": "application/json" });
  ctx.res.end(JSON.stringify({ success: true, data: { alertsTriggered: alerts.length, alerts } }));
});

/**
 * GET /api/alerts/history
 */
route("GET", "/api/alerts/history", async (ctx) => {
  const limit = parseInt(ctx.query.get("limit") || "100");
  try {
    const alerts = await query<any>(`SELECT TOP (@limit) id, config_key as title, config_value, created_at FROM app_configs WHERE config_key LIKE 'LOG:%' ORDER BY created_at DESC`, [
      { name: 'limit', type: sql.Int, value: limit }
    ]);
    const formatted = alerts.map((a: any) => ({ ...JSON.parse(a.config_value || "{}"), id: a.id, title: a.title, createdAt: a.created_at }));
    ctx.res.writeHead(200, { "Content-Type": "application/json" });
    ctx.res.end(JSON.stringify({ success: true, data: formatted }));
  } catch (e: any) {
    ctx.res.writeHead(200, { "Content-Type": "application/json" });
    ctx.res.end(JSON.stringify({ success: true, data: [] }));
  }
});

/**
 * GET /api/alerts/active
 */
route("GET", "/api/alerts/active", async (ctx) => {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  try {
    const alerts = await query<any>(`SELECT TOP 50 id, config_key as title, config_value, created_at FROM app_configs WHERE config_key LIKE 'LOG:%' AND created_at >= @since ORDER BY created_at DESC`, [{ name: "since", type: sql.DateTime, value: yesterday }]);
    const formatted = alerts.map((a: any) => ({ ...JSON.parse(a.config_value || "{}"), id: a.id, title: a.title, createdAt: a.created_at }));
    ctx.res.writeHead(200, { "Content-Type": "application/json" });
    ctx.res.end(JSON.stringify({ success: true, data: formatted }));
  } catch (e: any) {
    ctx.res.writeHead(200, { "Content-Type": "application/json" });
    ctx.res.end(JSON.stringify({ success: true, data: [] }));
  }
});

/**
 * GET /api/alerts/defaults
 */
route("GET", "/api/alerts/defaults", async (ctx) => {
  ctx.res.writeHead(200, { "Content-Type": "application/json" });
  ctx.res.end(JSON.stringify({ success: true, data: DEFAULT_ALERT_RULES }));
});

/**
 * POST /api/alerts/defaults/seed
 */
route("POST", "/api/alerts/defaults/seed", async (ctx) => {
  let created = 0;
  for (const rule of DEFAULT_ALERT_RULES) {
    try {
      await execute(
        `INSERT INTO app_configs (config_key, config_value, is_sensitive) VALUES (@key, @value, 0)`,
        [
            { name: "key", type: sql.NVarChar, value: "ALERT:" + rule.name },
          { name: "value", type: sql.NVarChar, value: JSON.stringify(rule) }
        ]
      );
      created++;
    } catch (e) {
      console.error(`[alerts/defaults/seed] Failed to create alert rule ${rule.name}:`, e);
    }
  }
  ctx.res.writeHead(200, { "Content-Type": "application/json" });
  ctx.res.end(JSON.stringify({ success: true, data: { created } }));
});
