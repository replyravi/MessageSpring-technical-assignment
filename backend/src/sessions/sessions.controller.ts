import { Controller, Get, Req } from '@nestjs/common';
import { Request } from 'express';
import { Session } from '@prisma/client';

@Controller('sessions')
export class SessionsController {
  /**
   * Lightweight endpoint that the SPA polls to check whether the session
   * is still valid. The global AuthGuard returns 401 when the cookie is
   * missing / invalid / stale; on a successful hit it also bumps
   * `lastSeenAt`, so the idle window keeps refreshing while the user
   * is active.
   */
  @Get('me')
  me(@Req() req: Request) {
    const session = req.user as Session;
    return {
      userId: session.userId,
      lastSeenAt: session.lastSeenAt,
      expiresAt: session.expiresAt,
    };
  }
}
