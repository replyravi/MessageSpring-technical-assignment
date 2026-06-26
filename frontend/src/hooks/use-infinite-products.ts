'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError, Product, ProductPage } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

type State = {
  items: Product[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
};

const INITIAL: State = { items: [], loading: true, error: null, hasMore: true };

export function useInfiniteProducts(pageSize: number, category?: string) {
  const { user } = useAuth();
  const [state, setState] = useState<State>(INITIAL);
  const cursorRef = useRef<number | null>(null);
  // Guard against concurrent fetches + the StrictMode double-effect.
  const inFlight = useRef(false);

  const loadMore = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const page: ProductPage = await api.products({
        cursor: cursorRef.current ?? undefined,
        limit: pageSize,
        category,
      });
      cursorRef.current = page.nextCursor;
      setState((s) => ({
        items: s.items.concat(page.items),
        hasMore: page.hasMore,
        loading: false,
        error: null,
      }));
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? e.status === 401
            ? 'Your session has expired. Please sign in again.'
            : e.message
          : 'Failed to load products.';
      setState((s) => ({ ...s, loading: false, error: msg }));
    } finally {
      inFlight.current = false;
    }
  }, [pageSize, category]);

  // Reset + reload when the *inputs* (pageSize, category) change. We read
  // hasMore from a ref inside loadMore so its identity stays stable.
  // The dependency array intentionally does NOT include loadMore.
  useEffect(() => {
    cursorRef.current = null;
    setState(INITIAL);
    // Reset the in-flight guard too — a previous request from the old
    // inputs would otherwise swallow the first new request.
    inFlight.current = false;
    void loadMore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageSize, category]);

  return {
    ...state,
    loadMore,
    ready: !!user,
  };
}
