'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useInfiniteProducts } from '@/hooks/use-infinite-products';
import { ProductCard, ProductCardSkeleton } from '@/components/product-card';

const PAGE_SIZE_OPTIONS = [5, 10, 20, 30, 50] as const;
const CATEGORIES = ['', 'Audio', 'Wearables', 'Phones', 'Laptops', 'Gaming', 'Cameras', 'Home', 'Accessories'];

export default function CatalogPage() {
  const router = useRouter();
  const { user, ready, logout } = useAuth();

  // Localstorage-persisted page size; clamped to 5..50.
  const [pageSize, setPageSize] = useState<number>(() => {
    if (typeof window === 'undefined') return 20;
    const stored = Number(window.localStorage.getItem('pageSize'));
    return Number.isFinite(stored) && stored >= 5 && stored <= 50 ? stored : 20;
  });
  const [category, setCategory] = useState<string>('');

  const { items, loading, error, hasMore, loadMore } = useInfiniteProducts(
    pageSize,
    category || undefined,
  );

  // Redirect unauthenticated users to /login once we know.
  useEffect(() => {
    if (ready && !user) router.replace('/login');
  }, [ready, user, router]);

  // Persist page size.
  useEffect(() => {
    window.localStorage.setItem('pageSize', String(pageSize));
  }, [pageSize]);

  // --- Infinite scroll via IntersectionObserver ----------------------
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;

    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.find((e) => e.isIntersecting);
        if (!visible) return;
        if (hasMore && !loading) void loadMore();
      },
      // Start loading ~400px before the user reaches the bottom.
      { rootMargin: '400px 0px' },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [hasMore, loading, loadMore]);

  const placeholderCount = useMemo(() => Math.min(pageSize, 10), [pageSize]);

  if (!ready) {
    return (
      <div className="container">
        <div className="grid">
          {Array.from({ length: 8 }, (_, i) => <ProductCardSkeleton key={i} />)}
        </div>
      </div>
    );
  }

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <span className="dot" /> Shopwave
          </div>
          <button className="secondary" onClick={() => void logout()}>
            Sign out
          </button>
        </div>
      </header>

      <main className="container">
        <div className="toolbar">
          <div className="toolbar-left">
            <label>
              Category
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c || 'All'}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="toolbar-left">
            <label>
              Items per page
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
              >
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {error && <div className="error-banner" role="alert">{error}</div>}

        <div className="grid">
          {items.map((p) => (
            <ProductCard key={p.id} p={p} />
          ))}
          {loading &&
            Array.from({ length: placeholderCount }, (_, i) => (
              <ProductCardSkeleton key={`sk-${i}`} />
            ))}
        </div>

        {/* Sentinel for IntersectionObserver. Also a fallback button for
            users with reduced motion / slow devices / IO disabled. */}
        <div ref={sentinelRef} className="sentry" style={{ minHeight: 1 }}>
          {!loading && hasMore && (
            <button onClick={() => void loadMore()}>Load more</button>
          )}
          {!hasMore && items.length > 0 && (
            <span>You&apos;ve reached the end.</span>
          )}
        </div>
      </main>
    </>
  );
}
