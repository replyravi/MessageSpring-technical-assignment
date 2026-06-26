import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SessionsService } from './sessions.service';

// Lightweight housekeeping so the sessions table doesn't grow forever.
@Injectable()
export class SessionsScheduler {
  private readonly logger = new Logger(SessionsScheduler.name);

  constructor(private readonly sessions: SessionsService) {}

  @Cron(CronExpression.EVERY_30_MINUTES)
  async pruneExpiredSessions() {
    try {
      await this.sessions.prune();
    } catch (err) {
      this.logger.warn(`session prune failed: ${(err as Error).message}`);
    }
  }
}
