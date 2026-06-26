/**
 * Debug proxy - logs everything sent to/from Genfity
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '.env-proxy');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const idx = line.indexOf('=');
    if (idx > 0) process.env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  });
}

const GENFITY_BASE = 'ai.genfity.com';
const GENFITY_TOKEN=process.env.GENFITY_KEY || process.env.ANTHROPIC_AUTH_TOKEN || '';
const PORT = 3011;  // different port for debug

const log = (msg) => console.log(`[${new Date().toISOString()}] ${msg}`);

const server = http.createServer(async (req, res) => {
  log(`REQUEST: ${req.method} ${req.url}`);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, anthropic-version, x-api-key');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
    res.writeHead(200);
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  if (req.method !== 'POST') { res.writeHead(404); res.end(); return; }

  let body = '';
  for await (const chunk of req) body += chunk;

  log(`BODY (${body.length} chars): ${body.slice(0, 500)}`);

  let reqData;
  try { reqData = JSON.parse(body); } catch (e) {
    log(`JSON ERROR: ${e.message}`);
    res.writeHead(400); res.end(JSON.stringify({ error: e.message })); return;
  }

  // Log all fields
  log(`model=${reqData.model} stream=${reqData.stream} max_tokens=${reqData.max_tokens}`);
  log(`messages count=${reqData.messages?.length}`);

  let messages = [];
  if (Array.isArray(reqData.messages)) {
    messages = reqData.messages.map(m => ({
      role: m.role,
      content: typeof m.content === 'string' ? m.content
        : Array.isArray(m.content) ? m.content.map(p => p.text || '').join('')
        : m.content?.text || ''
    }));
  }
  if (reqData.systemPrompt) messages.unshift({ role: 'system', content: reqData.systemPrompt });

  const model = reqData.model || 'genfity/claude-opus-4.6';
  const maxTokens = reqData.max_tokens || 4096;
  const stream = reqData.stream !== false;

  log(`FORWARDING: model=${model} stream=${stream} max_tokens=${maxTokens}`);

  const chatPayload = JSON.stringify({ model, messages, max_tokens: maxTokens, temperature: reqData.temperature ?? 1, stream });
  const opts = {
    hostname: GENFITY_BASE, port: 443, path: '/v1/chat/completions', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GENFITY_TOKEN}`, 'Content-Length': Buffer.byteLength(chatPayload) }
  };

  const proxyReq = https.request(opts, proxyRes => {
    log(`GENFITY STATUS: ${proxyRes.statusCode}`);

    if (!stream) {
      let data = '';
      proxyRes.on('data', c => data += c);
      proxyRes.on('end', () => {
        log(`GENFITY RESPONSE (${data.length} chars): ${data.slice(0, 300)}`);
        try {
          const cr = JSON.parse(data);
          const text = cr.choices?.[0]?.message?.content || '';
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ type: 'message', id: cr.id, model: cr.model, role: 'assistant', content: [{ type: 'text', text }], stop_reason: 'end_turn' }));
        } catch { res.writeHead(500); res.end(data); }
      });
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });

    const msgId = `msg_${Date.now()}`;
    let eventCount = 0;
    let sentMessageStart = false;
    let sentContentBlockStart = false;
    let finalStop = null;
    let finalUsage = null;

    proxyRes.on('data', chunk => {
      const text = chunk.toString();
      const lines = text.split('\n');
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line || !line.startsWith('data: ') || line === 'data: [DONE]') continue;
        let parsed;
        try { parsed = JSON.parse(line.slice(6)); } catch { continue; }

        const content = parsed.choices?.[0]?.delta?.content;
        const fr = parsed.choices?.[0]?.finish_reason;
        if (fr) { finalStop = fr; finalUsage = parsed.usage; }

        if (!sentMessageStart) {
          res.write(`event: message_start\ndata: ${JSON.stringify({ type: 'message_start', message: { id: msgId, type: 'message', role: 'assistant', content: [], model, stop_reason: null } })}\n\n`);
          sentMessageStart = true;
          eventCount++;
        }
        if (!sentContentBlockStart && content !== null && content !== undefined && content !== '') {
          res.write(`event: content_block_start\ndata: ${JSON.stringify({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } })}\n\n`);
          sentContentBlockStart = true;
          eventCount++;
        }
        if (content !== null && content !== undefined && content !== '') {
          res.write(`event: content_block_delta\ndata: ${JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: content } })}\n\n`);
          eventCount++;
        }
      }
    });

    proxyRes.on('end', () => {
      log(`SENT ${eventCount} events to Codex`);
      const stopReason = finalStop === 'stop' ? 'end_turn' : 'end_turn';
      res.write(`event: message_delta\ndata: ${JSON.stringify({ type: 'message_delta', usage: { output_tokens: finalUsage?.completion_tokens || 0 }, delta: { stop_reason: stopReason } })}\n\n`);
      res.write(`event: message_stop\ndata: ${JSON.stringify({ type: 'message_stop' })}\n\n`);
      res.end();
    });

    proxyRes.on('error', e => log(`GENFITY STREAM ERROR: ${e.message}`));
  });

  proxyReq.on('error', e => { log(`PROXY ERROR: ${e.message}`); res.writeHead(502); res.end(); });
  proxyReq.write(chatPayload);
  proxyReq.end();
});

server.listen(PORT, () => log(`DEBUG PROXY listening :${PORT}`));
