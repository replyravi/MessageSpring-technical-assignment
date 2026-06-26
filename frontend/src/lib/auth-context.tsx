'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError, SessionInfo } from '@/lib/api';

type AuthState = {
  user: { id: number; email: string; fullName: string } | null;
  session: SessionInfo | null;
  ready: boolean; // has the initial /me finished?
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const Ctx = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<AuthState['user']>(null);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [ready, setReady] = useState(false);

  // Keep the latest session in a ref so the idle timer doesn't get stale.
  const idleMsRef = useRef<number>(30 * 60 * 1000);
  const lastActivityRef = useRef<number>(Date.now());

  const logout = useCallback(async () => {
    await api.logout();
    setUser(null);
    setSession(null);
    router.replace('/login');
  }, [router]);

  // --- Idle watcher ---------------------------------------------------
  // The backend enforces the real 30-min timeout; this client-side check
  // is just for UX so the UI proactively bounces the user instead of
  // waiting for the next API call to 401.
  useEffect(() => {
    if (!user) return;

    const bump = () => { lastActivityRef.current = Date.now(); };
    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));

    const interval = window.setInterval(() => {
      const idle = Date.now() - lastActivityRef.current;
      if (idle > idleMsRef.current) {
        void logout();
      }
    }, 30_000);

    // Also poll the backend every couple of minutes. This does two things:
    //  1) refreshes lastSeenAt (rolling session)
    //  2) catches the case where another tab logged out
    const poll = window.setInterval(async () => {
      try {
        await api.me();
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          void logout();
        }
      }
    }, 120_000);

    return () => {
      events.forEach((e) => window.removeEventListener(e, bump));
      window.clearInterval(interval);
      window.clearInterval(poll);
    };
  }, [user, logout]);

  // On mount: figure out if we have a valid session.
  useEffect(() => {
    (async () => {
      try {
        await api.me();
        // We have a session; rehydrate minimal user info.
        // The login response carries the full user, but /me only returns
        // the id, so we just set a sentinel object.
        setUser({ id: 0, email: '', fullName: '' });
      } catch {
        setUser(null);
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.login(email, password);
    setUser(res.user);
    setSession(res.session);
    idleMsRef.current = res.session.idleMs;
    lastActivityRef.current = Date.now();
  }, []);

  const value = useMemo<AuthState>(
    () => ({ user, session, ready, login, logout }),
    [user, session, ready, login, logout],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
