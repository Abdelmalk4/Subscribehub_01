/**
 * Reminder Sender Job
 * Sends renewal reminders at 7, 3, and 1 day before expiration
 */

import { Bot } from 'grammy';
import { cronLogger as logger } from '../../shared/utils/index.js';
import { PLATFORM } from '../../shared/config/index.js';
import {
  getExpiringSubscriptions,
  wasReminderSent,
  logReminderSent,
} from '../services/subscription/index.js';
import { safeSendMessage } from '../../shared/integrations/telegram.js';
import { formatDate } from '../../shared/utils/date.js';
import { withFooter } from '../../shared/utils/format.js';

export async function runReminderSender(): Promise<void> {
  try {
    let totalSent = 0;

    for (const days of PLATFORM.REMINDER_DAYS) {
      const expiring = await getExpiringSubscriptions(days);

      logger.debug({ days, count: expiring.length }, 'Found expiring subscriptions');

      for (const sub of expiring) {
        try {
          // Check if reminder already sent
          const alreadySent = await wasReminderSent(sub.id, days);
          if (alreadySent) {
            continue;
          }

          // Send reminder
          if (!sub.bot) continue;

          const bot = new Bot(sub.bot.bot_token);
          const message = getReminderMessage(days, sub.subscriptionEndDate);

          const success = await safeSendMessage(
            bot,
            Number(sub.telegramUserId),
            message,
            { parse_mode: 'Markdown' }
          );

          // Log the reminder
          await logReminderSent(sub.id, days, success);

          if (success) {
            totalSent++;
          }
        } catch (error) {
          logger.error({ error, subscriberId: sub.id }, 'Failed to send reminder');
          await logReminderSent(sub.id, days, false, String(error));
        }
      }
    }

    logger.info({ totalSent }, 'Reminder sender completed');
  } catch (error) {
    logger.error({ error }, 'Reminder sender job failed');
  }
}

function getReminderMessage(daysLeft: number, expirationDate: Date): string {
  const emoji = daysLeft === 1 ? '🚨' : daysLeft <= 3 ? '⚠️' : '📢';
  const urgency = daysLeft === 1 ? 'FINAL REMINDER' : daysLeft <= 3 ? 'Reminder' : 'Heads up';

  return withFooter(`
${emoji} *${urgency}: Subscription Expiring*

Your subscription will expire in *${daysLeft} day${daysLeft > 1 ? 's' : ''}*.

📅 *Expiration Date:* ${formatDate(expirationDate)}

Renew now to maintain uninterrupted access!

Use /renew or /plans to continue.
`);
}
