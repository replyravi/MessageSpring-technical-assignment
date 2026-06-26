import {
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Response, Request } from 'express';
import argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';
import { UsersService } from '../users/users.service';
import { SessionsService } from '../sessions/sessions.service';
import { SESSION_CONFIG, LOGIN_POLICY } from '../common/config';
import { LoginDto } from './dto/login.dto';

// Track bad attempts per (email + ip) tuple. In a real multi-instance
// deployment this would live in Redis; the shape is identical.
type Attempt = { count: number; lockedUntil: number };

// Pre-computed invalid hash so we can run argon2.verify even when the
// account doesn't exist, which keeps response timing roughly constant.
const DUMMY_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$c2FsdA$YzU5ZjM3MzU4ZjM4ZmU4NTNkMzU3MzQ4NTc4ZTM4ZmU';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly attempts = new Map<string, Attempt>();

  constructor(
    private readonly users: UsersService,
    private readonly sessions: SessionsService,
    private readonly prisma: PrismaClient,
  ) {}

  async login(dto: LoginDto, req: Request, res: Response) {
    const email = dto.email.toLowerCase().trim();
    const ip = this.clientIp(req);
    const key = `${email}|${ip}`;

    // Honeypot: the `website` field is invisible to real users, so anything
    // that fills it in is almost certainly a bot. Treat it like a bad
    // password — count it against the attempt limit and give the generic
    // error so we don't reveal that we spotted the trap.
    if (dto.website && dto.website.trim().length > 0) {
      this.recordFailure(key);
      throw new UnauthorizedException('Invalid email or password.');
    }

    if (this.isLocked(key)) {
      // Vague message on purpose — don't leak whether the email exists.
      throw new UnauthorizedException(
        'Too many attempts. Please try again later.',
      );
    }

    const user = await this.users.findByEmail(email);
    // Always run a hash check so timing stays similar regardless of whether
    // the account exists (mitigates user-enumeration via timing).
    const ok = user
      ? await this.users.verifyPassword(user, dto.password)
      : await this.dummyVerify(dto.password);

    if (!user || !ok) {
      this.recordFailure(key);
      throw new UnauthorizedException('Invalid email or password.');
    }

    // Success — clear the attempt counter for this key.
    this.attempts.delete(key);

    const { token, session } = await this.sessions.create({
      userId: user.id,
      ip,
      userAgent: req.headers['user-agent']?.slice(0, 255),
    });

    this.setCookie(res, token);

    this.logger.log(`user ${user.id} logged in from ${ip}`);

    return {
      user: { id: user.id, email: user.email, fullName: user.fullName },
      session: {
        lastSeenAt: session.lastSeenAt,
        expiresAt: session.expiresAt,
        idleMs: SESSION_CONFIG.idleMs,
      },
    };
  }

  async logout(req: Request, res: Response) {
    const token = req.cookies?.[SESSION_CONFIG.cookieName];
    if (token) {
      await this.sessions.revoke(token);
    }
    res.clearCookie(SESSION_CONFIG.cookieName, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
    });
    return { ok: true };
  }

  // ---------- helpers ----------

  private setCookie(res: Response, token: string) {
    res.cookie(SESSION_CONFIG.cookieName, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.COOKIE_SECURE === 'true',
      path: '/',
      maxAge: SESSION_CONFIG.ttlMs,
    });
  }

  private isLocked(key: string): boolean {
    const a = this.attempts.get(key);
    if (!a) return false;
    // Not yet at the threshold — no lock to check.
    if (a.count < LOGIN_POLICY.maxAttempts) return false;
    // We've crossed the threshold. If the lock window has elapsed, reset.
    if (Date.now() >= a.lockedUntil) {
      this.attempts.delete(key);
      return false;
    }
    return true;
  }

  private recordFailure(key: string) {
    const a = this.attempts.get(key) ?? { count: 0, lockedUntil: 0 };
    a.count += 1;
    if (a.count >= LOGIN_POLICY.maxAttempts) {
      a.lockedUntil = Date.now() + LOGIN_POLICY.lockMs;
    }
    this.attempts.set(key, a);
  }

  private clientIp(req: Request): string {
    const xf = req.headers['x-forwarded-for'];
    if (typeof xf === 'string' && xf.length > 0) return xf.split(',')[0]!.trim();
    return req.ip ?? 'unknown';
  }

  private async dummyVerify(password: string): Promise<boolean> {
    try {
      await argon2.verify(DUMMY_HASH, password);
    } catch {
      /* hash is intentionally malformed */
    }
    return false;
  }
}
