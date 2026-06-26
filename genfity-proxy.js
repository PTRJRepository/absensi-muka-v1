/**
 * Genfity Responses Proxy
 * Codex CLI /v1/responses → Genfity /v1/chat/completions
 * Run: node genfity-proxy.js
 * Codex base_url: http://localhost:3010/v1
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

// Load .env-proxy
const envPath = path.join(__dirname, '.env-proxy');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const idx = line.indexOf('=');
    if (idx > 0) process.env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  });
}

const GENFITY_BASE = 'ai.genfity.com';
const GENFITY_TOKEN = process.env.GENFITY_KEY || process.env.ANTHROPIC_AUTH_TOKEN || '';
const PORT = 3010;

function sse(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

const server = http.createServer(async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, anthropic-version, x-api-key');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  // Health
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', token_len: GENFITY_TOKEN.length }));
    return;
  }

  // GET /v1/models
  if (req.method === 'GET' && url.pathname === '/v1/models') {
    const opts = { hostname: GENFITY_BASE, port: 443, path: '/v1/models', method: 'GET',
      headers: { 'Authorization': `Bearer ${GENFITY_TOKEN}` } };
    const pr = https.request(opts, pr => { let d = ''; pr.on('data', c => d += c); pr.on('end', () => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(d); }); });
    pr.on('error', e => { res.writeHead(502); res.end(JSON.stringify({ error: e.message })); });
    pr.end(); return;
  }

  // POST /v1/responses
  if (req.method !== 'POST' || url.pathname !== '/v1/responses') {
    res.writeHead(404); res.end(); return;
  }

  let body = '';
  for await (const chunk of req) body += chunk;

  let reqData;
  try { reqData = JSON.parse(body); } catch {
    res.writeHead(400); res.end(JSON.stringify({ error: 'invalid JSON' })); return;
  }

  // Build messages array
  let messages = [];
  if (Array.isArray(reqData.messages)) {
    messages = reqData.messages.map(m => ({
      role: m.role,
      content: typeof m.content === 'string' ? m.content
        : Array.isArray(m.content) ? m.content.map(p => p.text || p.content || '').join('')
        : m.content?.text || m.content?.content || ''
    }));
  } else if (reqData.query) {
    messages = [{ role: 'user', content: reqData.query }];
  } else if (reqData.input) {
    messages = [{ role: 'user', content: String(reqData.input) }];
  }
  if (reqData.systemPrompt) messages.unshift({ role: 'system', content: reqData.systemPrompt });
  else if (reqData.system_prompt) messages.unshift({ role: 'system', content: reqData.system_prompt });

  // Codex strips provider prefix — re-add it so Genfity recognizes the model
  const rawModel = reqData.model || 'genfity/claude-opus-4.6';
  const model = rawModel.startsWith('genfity/') ? rawModel : `genfity/${rawModel}`;
  const maxTokens = reqData.max_tokens || reqData.max_output_tokens || reqData.metadata?.max_tokens || 4096;
  const stream = reqData.stream !== false;

  const chatPayload = JSON.stringify({
    model, messages,
    max_tokens: maxTokens,
    temperature: reqData.temperature ?? 1,
    top_p: reqData.top_p,
    stream
  });

  const opts = {
    hostname: GENFITY_BASE, port: 443, path: '/v1/chat/completions', method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GENFITY_TOKEN}`,
      'Content-Length': Buffer.byteLength(chatPayload)
    }
  };

  const proxyReq = https.request(opts, proxyRes => {
    if (!stream) {
      // ─── NON-STREAMING ───
      let data = '';
      proxyRes.on('data', c => data += c);
      proxyRes.on('end', () => {
        try {
          const cr = JSON.parse(data);
          const choice = cr.choices?.[0];
          const text = choice?.message?.content || '';
          res.writeHead(200, { 'Content-Type': 'application/json', 'anthropic-sse-content-type': 'application/json' });
          res.end(JSON.stringify({
            type: 'message',
            id: cr.id || `resp_${Date.now()}`,
            model: cr.model || model,
            role: 'assistant',
            content: [{ type: 'text', text }],
            stop_reason: choice?.finish_reason === 'stop' ? 'end_turn' : choice?.finish_reason || 'end_turn',
            usage: { input_tokens: cr.usage?.prompt_tokens || 0, output_tokens: cr.usage?.completion_tokens || 0, total_tokens: cr.usage?.total_tokens || 0 }
          }));
        } catch {
          res.writeHead(proxyRes.statusCode || 500); res.end(data);
        }
      });
      return;
    }

    // ─── STREAMING ───
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const msgId = `msg_${Date.now()}`;
    let accumulated = '';
    let finalStopReason = null;
    let finalUsage = null;
    let sentContentBlockStart = false;
    let sentMessageStart = false;

    // Buffer all chunks, extract content, find final
    proxyRes.on('data', chunk => {
      const text = chunk.toString();
      const lines = text.split('\n');

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line || !line.startsWith('data: ') || line === 'data: [DONE]') continue;

        let parsed;
        try { parsed = JSON.parse(line.slice(6)); } catch { continue; }

        const delta = parsed.choices?.[0]?.delta;
        const content = delta?.content;
        const fr = parsed.choices?.[0]?.finish_reason;
        if (fr) { finalStopReason = fr; finalUsage = parsed.usage; }

        // Send message_start once
        if (!sentMessageStart) {
          sse(res, 'message_start', {
            type: 'message_start',
            message: { id: msgId, type: 'message', role: 'assistant', content: [], model, stop_reason: null }
          });
          sentMessageStart = true;
        }

        // Send content_block_start once with first content
        if (!sentContentBlockStart && content !== null && content !== undefined && content !== '') {
          sse(res, 'content_block_start', {
            type: 'content_block_start', index: 0,
            content_block: { type: 'text', text: '' }
          });
          sentContentBlockStart = true;
        }

        // Send content deltas
        if (content !== null && content !== undefined && content !== '') {
          sse(res, 'content_block_delta', {
            type: 'content_block_delta', index: 0,
            delta: { type: 'text_delta', text: content }
          });
        }
      }
    });

    proxyRes.on('end', () => {
      // Send message_delta with stop reason
      const stopReason = finalStopReason === 'stop' ? 'end_turn' : finalStopReason === 'length' ? 'max_tokens' : 'end_turn';
      sse(res, 'message_delta', {
        type: 'message_delta',
        usage: { output_tokens: finalUsage?.completion_tokens || 0 },
        delta: { stop_reason: stopReason }
      });
      sse(res, 'message_stop', { type: 'message_stop' });
      res.end();
    });

    proxyRes.on('error', err => { console.error('proxy stream error:', err.message); });
  });

  proxyReq.on('error', err => {
    console.error('proxy req error:', err.message);
    res.writeHead(502); res.end(JSON.stringify({ error: err.message }));
  });

  proxyReq.write(chatPayload);
  proxyReq.end();
});

server.listen(PORT, () => {
  console.log(`Genfity Proxy → http://localhost:${PORT}/v1`);
  console.log(`Token: ${GENFITY_TOKEN ? `SET (len=${GENFITY_TOKEN.length})` : 'MISSING'}`);
});
