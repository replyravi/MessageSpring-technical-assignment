'use client';

import { Product } from '@/lib/api';

const LOCALE: Record<string, string> = { USD: 'en-US' };

function formatPrice(cents: number, currency: string) {
  try {
    return new Intl.NumberFormat(LOCALE[currency] ?? 'en-US', {
      style: 'currency',
      currency,
    }).format(cents / 100);
  } catch {
    return `$${(cents / 100).toFixed(2)}`;
  }
}

export function ProductCard({ p }: { p: Product }) {
  return (
    <article className="card" aria-label={p.name}>
      {/* External picsum images — plain <img> is intentional; next/image
          would require a remote pattern config and adds no value for
          random placeholder art. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="card-img"
        src={p.imageUrl}
        alt={p.name}
        loading="lazy"
        // Don't let a broken picsum image kill the layout.
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.visibility = 'hidden';
        }}
      />
      <div className="card-body">
        <span className="card-cat">{p.category}</span>
        <h3 className="card-name">{p.name}</h3>
        <p className="card-desc">{p.description}</p>
        <div className="card-foot">
          <span className="card-price">{formatPrice(p.priceCents, p.currency)}</span>
          <span className="card-rating">★ {p.rating.toFixed(1)}</span>
        </div>
      </div>
    </article>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="card" aria-hidden>
      <div className="skeleton card-img" />
      <div className="card-body">
        <div className="skeleton" style={{ width: '40%', height: 12 }} />
        <div className="skeleton" style={{ width: '80%', height: 16, marginTop: 4 }} />
        <div className="skeleton" style={{ width: '100%', height: 12, marginTop: 6 }} />
        <div className="skeleton" style={{ width: '60%', height: 12 }} />
        <div className="card-foot">
          <div className="skeleton" style={{ width: 60, height: 18 }} />
          <div className="skeleton" style={{ width: 40, height: 14 }} />
        </div>
      </div>
    </div>
  );
}
