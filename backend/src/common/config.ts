// Central place for session / security tuning. Reading these from the env
// keeps the 30-minute inactivity timeout overridable for testing.
export const SESSION_CONFIG = {
  cookieName: process.env.SESSION_COOKIE ?? 'sid',
  // Absolute session lifetime (time-to-live). Default 8h.
  ttlMs: Number(process.env.SESSION_TTL_MS ?? 8 * 60 * 60 * 1000),
  // Idle / inactivity window. After this many ms without activity the
  // session is considered stale and must be re-authenticated.
  idleMs: Number(process.env.SESSION_IDLE_MS ?? 30 * 60 * 1000),
  rolling: true,
} as const;

export const LOGIN_POLICY = {
  // Lock the account for a short window after N bad attempts.
  maxAttempts: Number(process.env.LOGIN_MAX_ATTEMPTS ?? 5),
  lockMs: Number(process.env.LOGIN_LOCK_MS ?? 5 * 60 * 1000),
} as const;
