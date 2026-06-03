function getApiBase() {
  // Browser: same-origin relative path
  if (typeof window !== 'undefined') return '/api';
  // Server-side render: need absolute URL
  return `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/api`;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${getApiBase()}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init.headers,
    },
    credentials: 'include',
  });

  if (!res.ok) {
    let code = 'API_ERROR';
    let message = `HTTP ${res.status}`;
    try {
      const err = (await res.json()) as { error?: { code?: string; message?: string } };
      code = err.error?.code ?? code;
      message = err.error?.message ?? message;
    } catch {}
    throw new ApiError(res.status, code, message);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export function authFetch<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  return apiFetch<T>(path, {
    ...init,
    headers: {
      ...((init.headers ?? {}) as Record<string, string>),
      Authorization: `Bearer ${token}`,
    },
  });
}
