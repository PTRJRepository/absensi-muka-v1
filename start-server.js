require('dotenv').config({ path: '.env' });
const { env } = require('./dist/config/env');
const http = require('http');
const { handleRequest } = require('./dist/api/router');
const { authMiddleware } = require('./dist/api/middleware/auth');
require('./dist/api/routes');

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  await handleRequest(req, res, authMiddleware);
});

server.listen(env.APP_PORT, () => {
  console.log('SERVER UP on port', env.APP_PORT);
});

process.on('SIGTERM', () => { server.close(); process.exit(0); });
process.on('SIGINT', () => { server.close(); process.exit(0); });
