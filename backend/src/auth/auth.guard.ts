import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from './public.decorator';
import { SessionsService } from '../sessions/sessions.service';
import { SESSION_CONFIG } from '../common/config';

// Reads the cookie, resolves the session, attaches it to `req.user`, and
// rolls `lastSeenAt` forward. Any failure here -> 401.
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionsService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<Request>();
    const token = req.cookies?.[SESSION_CONFIG.cookieName];
    if (!token) throw new UnauthorizedException('Session required.');

    const session = await this.sessions.findActiveByToken(token);
    if (!session) throw new UnauthorizedException('Session expired.');

    // Rolling update: every authenticated request extends the idle window.
    await this.sessions.touch(session);
    req.user = session;
    return true;
  }
}
