import type { ErrorBody, TokenResponse } from './types';

/** Relative /api by default (Vite proxy in development, nginx in production). */
export const API_BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '');

const SESSION_KEY = 'spareslot.session';

export interface Session {
  token: string;
  userId: string;
  role: TokenResponse['role'];
  orgId: string | null;
  fullName: string;
}

let session: Session | null = readStored();
const listeners = new Set<(s: Session | null) => void>();

function readStored(): Session | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function getSession(): Session | null {
  return session;
}

export function setSession(next: Session | null): void {
  session = next;
  try {
    if (next) sessionStorage.setItem(SESSION_KEY, JSON.stringify(next));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // storage may be unavailable (private mode); the in-memory session still works
  }
  listeners.forEach((l) => l(next));
}

export function onSessionChange(listener: (s: Session | null) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly rule?: string;
  readonly details?: Record<string, unknown>;

  constructor(status: number, body: ErrorBody) {
    super(body.message);
    this.status = status;
    this.code = body.code;
    this.rule = body.rule;
    this.details = body.details;
  }
}

/** Called when the server says the session is no longer valid. Set by the app to redirect to sign-in. */
let onUnauthorized: () => void = () => {};
export function setUnauthorizedHandler(handler: () => void): void {
  onUnauthorized = handler;
}

type Body = unknown;

async function request<T>(method: string, path: string, body?: Body): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const isForm = body instanceof FormData;
  if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json';
  if (session) headers.Authorization = `Bearer ${session.token}`;

  let res: Response;
  try {
    res = await fetch(API_BASE + path, {
      method,
      headers,
      body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, {
      code: 'network',
      message: 'Could not reach the server. Check your connection and try again.',
    });
  }

  if (res.status === 401 && session && !path.startsWith('/api/auth/')) {
    setSession(null);
    onUnauthorized();
  }
  if (!res.ok) {
    let err: ErrorBody = { code: 'http_' + res.status, message: 'Something went wrong (' + res.status + ').' };
    try {
      const parsed = (await res.json()) as Partial<ErrorBody>;
      if (parsed && typeof parsed.message === 'string') err = { ...err, ...parsed } as ErrorBody;
    } catch {
      // not JSON
    }
    throw new ApiError(res.status, err);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const http = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: Body) => request<T>('POST', path, body ?? {}),
  put: <T>(path: string, body: Body) => request<T>('PUT', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
  upload: <T>(path: string, form: FormData) => request<T>('POST', path, form),
};

/** Fetches a private image (booking condition photo) with the bearer token and returns an object URL. */
export async function fetchPrivateImage(path: string): Promise<string> {
  const headers: Record<string, string> = {};
  if (session) headers.Authorization = `Bearer ${session.token}`;
  const res = await fetch(API_BASE + path, { headers });
  if (!res.ok) throw new ApiError(res.status, { code: 'photo', message: 'This photo could not be loaded.' });
  return URL.createObjectURL(await res.blob());
}

export function qs(params: Record<string, string | number | boolean | null | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  }
  const s = p.toString();
  return s ? '?' + s : '';
}
