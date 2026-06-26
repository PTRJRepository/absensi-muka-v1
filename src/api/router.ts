import { IncomingMessage, ServerResponse } from 'http';
import { ZodError, ZodSchema } from 'zod';
import { sendError } from './response';

export interface RequestContext {
  req: IncomingMessage;
  res: ServerResponse;
  method: string;
  path: string;
  params: Record<string, string>;
  query: URLSearchParams;
  body: unknown;
  user?: { id: number; username: string; roles: string[] };
}

export type Handler = (ctx: RequestContext) => Promise<void>;
interface Route { method: string; pattern: RegExp; keys: string[]; handler: Handler; protected: boolean }

const routes: Route[] = [];

function compile(path: string) {
  const keys: string[] = [];
  const pattern = new RegExp(`^${path.replace(/:[^/]+/g, (match) => { keys.push(match.slice(1)); return '([^/]+)'; })}$`);
  return { pattern, keys };
}

export function route(method: string, path: string, handler: Handler, options: { protected?: boolean } = {}) {
  const compiled = compile(path);
  routes.push({ method, handler, protected: options.protected ?? true, ...compiled });
}

export function parseBody(req: IncomingMessage) {
  return new Promise<unknown>((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; if (data.length > 1_000_000) reject(new Error('Body too large')); });
    req.on('end', () => {
      if (!data) return resolve(undefined);
      try { resolve(JSON.parse(data)); } catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

export function validate<T>(schema: ZodSchema<T>, value: unknown): T {
  return schema.parse(value);
}

export async function handleRequest(req: IncomingMessage, res: ServerResponse, auth: (ctx: RequestContext, isProtected: boolean) => Promise<void>) {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const method = req.method ?? 'GET';
  const matched = routes.find((item) => item.method === method && item.pattern.test(url.pathname));
  if (!matched) return sendError(res, 404, 'NOT_FOUND', 'Endpoint not found');

  const match = url.pathname.match(matched.pattern);
  const params: Record<string, string> = {};
  matched.keys.forEach((key, index) => { params[key] = decodeURIComponent(match?.[index + 1] ?? ''); });

  try {
    const body = method === 'GET' ? undefined : await parseBody(req);
    const ctx: RequestContext = { req, res, method, path: url.pathname, params, query: url.searchParams, body };
    await auth(ctx, matched.protected);
    await matched.handler(ctx);
  } catch (error) {
    if (error instanceof ZodError) return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid input');
    const message = error instanceof Error ? error.message : 'Internal error';
    return sendError(res, 500, 'INTERNAL_ERROR', message);
  }
}

