import http from 'http';
import fs from 'fs';
import path from 'path';
import { env, safeEnvSummary } from './config/env';
import { handleRequest } from './api/router';
import { authMiddleware } from './api/middleware/auth';
import { startSchedulerService } from './modules/scheduler/scheduler.service';
import './api/routes';

const PUBLIC_DIR = path.join(process.cwd(), 'src', 'public');

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function serveStatic(req: http.IncomingMessage, res: http.ServerResponse): boolean {
  let url = req.url ?? '/';
  // Strip query string
  url = url.split('?')[0];
  // Default to index for root
  if (url === '/') url = '/index.html';
  // Only allow safe relative paths
  const safe = path.normalize(url).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(PUBLIC_DIR, safe);

  // Security: stay within PUBLIC_DIR
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return true;
  }

  if (!fs.existsSync(filePath)) return false;

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';

  try {
    const content = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
    return true;
  } catch {
    res.writeHead(500);
    res.end('Server error');
    return true;
  }
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Try static files first
  if (req.method === 'GET' && serveStatic(req, res)) return;

  // Then API
  await handleRequest(req, res, authMiddleware);
});

server.listen(env.APP_PORT, () => {
  console.log('Sistem Monitoring Absensi API running', safeEnvSummary());
  // Start scheduler service
  try {
    startSchedulerService();
    console.log('Scheduler service started');
  } catch (err) {
    console.error('Failed to start scheduler:', err);
  }
});
