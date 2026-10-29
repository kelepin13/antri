import { Injectable, Logger } from '@nestjs/common';

export interface PushMessage {
  userId: string;
  ticketId: string;
  message: string;
}

/**
 * Stand-in for a real push provider (Firebase Cloud Messaging, OneSignal, WhatsApp...).
 * Notifications are always stored in the database first, so the app can list them
 * even when no provider is configured.
 */
@Injectable()
export class PushSender {
  private readonly logger = new Logger('Push');

  async send(messages: PushMessage[]): Promise<void> {
    for (const m of messages) {
      this.logger.log(`-> user ${m.userId}: ${m.message}`);
    }
  }
}
