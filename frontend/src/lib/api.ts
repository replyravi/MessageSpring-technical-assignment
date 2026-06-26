// Shared API client. Hits /api/* which Next.js rewrites to the NestJS
// backend in dev. `credentials: 'include'` carries the session cookie.

export type Product = {
  id: number;
  slug: string;
  name: string;
  description: string;
  priceCents: number;
  currency: string;
  category: string;
  imageUrl: string;
  rating: number;
  stock: number;
};

export type ProductPage = {
  items: Product[];
  nextCursor: number | null;
  hasMore: boolean;
};

export type SessionInfo = {
  lastSeenAt: string;
  expiresAt: string;
  idleMs: number;
};

export type AuthError = { status: number; message: string };

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function handle<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as unknown as T;
  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try { body = JSON.parse(text); } catch { body = text; }
  }
  if (!res.ok) {
    const msg =
      (body as { message?: string })?.message ??
      (typeof body === 'string' ? body : 'Request failed');
    throw new ApiError(res.status, Array.isArray(msg) ? msg.join(', ') : msg);
  }
  return body as T;
}

export const api = {
  async login(email: string, password: string, website = ''): Promise<{ user: { id: number; email: string; fullName: string }; session: SessionInfo }> {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      // `website` is the honeypot value — empty for real users.
      body: JSON.stringify({ email, password, website }),
    });
    return handle(res);
  },

  async logout(): Promise<void> {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
    }).catch(() => {});
  },

  async me(): Promise<{ userId: number; lastSeenAt: string; expiresAt: string }> {
    const res = await fetch('/api/sessions/me', { credentials: 'include' });
    return handle(res);
  },

  async products(params: { cursor?: number; limit: number; category?: string }): Promise<ProductPage> {
    const url = new URL('/api/products', window.location.origin);
    url.searchParams.set('limit', String(params.limit));
    if (params.cursor) url.searchParams.set('cursor', String(params.cursor));
    if (params.category) url.searchParams.set('category', params.category);
    const res = await fetch(url, { credentials: 'include' });
    return handle(res);
  },
};
