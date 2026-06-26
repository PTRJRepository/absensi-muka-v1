import { api } from '../lib/api';
import type { ApiEnvelope } from '../types';

export interface NormalizedResponse<T> {
  data: T;
  meta: NonNullable<ApiEnvelope<T>['meta']>;
}

export function isEnvelope<T>(payload: unknown): payload is ApiEnvelope<T> {
  return typeof payload === 'object' && payload !== null && 'success' in payload;
}

export async function requestData<T>(path: string, options: RequestInit = {}): Promise<T> {
  return api<T>(path, options);
}

export function normalizeArray<T>(value: T[] | { items?: T[] } | null | undefined): T[] {
  if (Array.isArray(value)) return value;
  if (value && Array.isArray(value.items)) return value.items;
  return [];
}

export function toNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function toStringOrNull(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  return String(value);
}

export function nowIso(): string {
  return new Date().toISOString();
}
