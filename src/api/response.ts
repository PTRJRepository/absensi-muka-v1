import { ServerResponse } from 'http';

export interface ApiErrorPayload { code: string; message: string }
export interface ApiMetaPayload {
  generated_at?: string;
  page?: number;
  page_size?: number;
  total?: number;
  source?: string;
  quality_score?: number;
  [key: string]: unknown;
}

export function sendJson(res: ServerResponse, statusCode: number, data: unknown, message = 'OK') {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ success: true, data, message }));
}

export function sendError(res: ServerResponse, statusCode: number, code: string, message: string) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ success: false, error: { code, message } }));
}

export function sendEnvelope(
  res: ServerResponse,
  statusCode: number,
  data: unknown,
  meta: ApiMetaPayload = {},
  errors: Array<ApiErrorPayload & { detail?: string }> = []
) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({
    success: errors.length === 0,
    data,
    meta: {
      generated_at: new Date().toISOString(),
      ...meta,
    },
    errors,
  }));
}
