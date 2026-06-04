import { fetch, RequestInit } from 'undici';
import { loadCliToken } from '../keystore.js';

const DEFAULT_API_URL = 'https://envoy-five.vercel.app';

function getApiUrl(): string {
  return process.env.ENVOY_API_URL ?? DEFAULT_API_URL;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiRequest<T>(
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<T> {
  const token = await loadCliToken();
  const url = `${getApiUrl()}${path}`;

  const reqHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'envoy-cli/0.1.0',
    ...headers,
  };

  if (token) {
    reqHeaders['Authorization'] = `Bearer ${token}`;
  }

  const init: RequestInit = {
    method,
    headers: reqHeaders,
  };

  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }

  const response = await fetch(url, init);

  if (!response.ok) {
    let code = 'API_ERROR';
    let message = `HTTP ${response.status}`;
    try {
      const err = (await response.json()) as { error?: { code?: string; message?: string } };
      code = err.error?.code ?? code;
      message = err.error?.message ?? message;
    } catch {
      // ignore parse error
    }
    throw new ApiError(response.status, code, message);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string, headers?: Record<string, string>) =>
    apiRequest<T>('GET', path, undefined, headers),
  post: <T>(path: string, body?: unknown) =>
    apiRequest<T>('POST', path, body),
  put: <T>(path: string, body?: unknown, headers?: Record<string, string>) =>
    apiRequest<T>('PUT', path, body, headers),
  patch: <T>(path: string, body?: unknown) =>
    apiRequest<T>('PATCH', path, body),
  delete: <T>(path: string) =>
    apiRequest<T>('DELETE', path),
};
