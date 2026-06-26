import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaClient, Session } from '@prisma/client';
import { SESSION_CONFIG } from '../common/config';

// We expose a controlled view of the session to the client and never leak
// the raw token via class-transformer @Exclude semantics downstream.
export type PublicSession = Pick<Session, 'id' | 'userId' | 'lastSeenAt' | 'expiresAt'>;

@Injectable()
export class SessionsService {
  constructor(private readonly prisma: PrismaClient) {}

  /** Create a brand new session row + opaque cookie token. */
  async create(opts: { userId: number; ip?: string; userAgent?: string }) {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + SESSION_CONFIG.ttlMs);

    // 32 bytes of entropy, base64url -> ~43 chars. Opaque to the client.
    const token = randomBytes(32).toString('base64url');

    const session = await this.prisma.session.create({
      data: {
        token,
        userId: opts.userId,
        ip: opts.ip,
        userAgent: opts.userAgent,
        expiresAt,
        lastSeenAt: now,
      },
    });

    return { token, session };
  }

  /**
   * Look up a session by token. Returns null when:
   *  - not found
   *  - already revoked
   *  - past its absolute expiry
   *  - past the 30-minute idle window (we invalidate it lazily here)
   *
   * Lazy invalidation keeps the design simple: a background sweeper isn't
   * required, but SessionsModule adds one anyway to keep the table small.
   */
  async findActiveByToken(token: string): Promise<Session | null> {
    const session = await this.prisma.session.findUnique({
      where: { token },
    });
    if (!session || session.revokedAt) return null;

    const now = Date.now();
    if (session.expiresAt.getTime() <= now) return null;

    const idleSince = session.lastSeenAt.getTime();
    if (now - idleSince > SESSION_CONFIG.idleMs) {
      // Idle too long — revoke and force re-login.
      await this.revoke(session.token);
      return null;
    }
    return session;
  }

  /** Bump lastSeenAt on every authenticated request (rolling session). */
  async touch(session: Session): Promise<Session> {
    const touched = await this.prisma.session.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date() },
    });
    return touched;
  }

  async revoke(token: string) {
    await this.prisma.session.updateMany({
      where: { token, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(userId: number) {
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Garbage-collect expired / revoked rows. Called on a schedule. */
  async prune(maxPerRun = 500) {
    const cutoff = new Date();
    // deleteMany doesn't accept `take`, so we scope by id instead.
    const stale = await this.prisma.session.findMany({
      where: {
        OR: [
          { revokedAt: { not: null } },
          { expiresAt: { lt: cutoff } },
        ],
      },
      select: { id: true },
      take: maxPerRun,
    });
    if (stale.length === 0) return;
    await this.prisma.session.deleteMany({
      where: { id: { in: stale.map((s) => s.id) } },
    });
  }
}
