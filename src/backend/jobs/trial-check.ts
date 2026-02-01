/**
 * Trial Check Job
 * Daily check for expired client trials
 */

import { Bot } from 'grammy';
import { cronLogger as logger } from '../../shared/utils/index.js';
import { config, PLATFORM } from '../../shared/config/index.js';
import {
  getExpiredTrials,
  getExpiringTrials,
  expireTrial,
  wasTrialReminderSent,
  logTrialReminderSent,
} from '../services/trial/index.js';
import { safeSendMessage } from '../../shared/integrations/telegram.js';
import { formatDate } from '../../shared/utils/date.js';
import { withFooter } from '../../shared/utils/format.js';

// Single bot instance to avoid creating multiple instances
let mainBotInstance: Bot | null = null;

function getMainBot(): Bot {
  if (!mainBotInstance) {
    mainBotInstance = new Bot(config.MAIN_BOT_TOKEN);
  }
  return mainBotInstance;
}

export async function runTrialCheck(): Promise<void> {
  try {
    // Process expired trials
    await processExpiredTrials();

    // Send trial expiration reminders
    await sendTrialReminders();

    logger.info('Trial check completed');
  } catch (error) {
    logger.error({ error }, 'Trial check job failed');
  }
}

async function processExpiredTrials(): Promise<void> {
  const expired = await getExpiredTrials();

  if (expired.length === 0) {
    logger.debug('No expired trials found');
    return;
  }

  logger.info({ count: expired.length }, 'Processing expired trials');

  const mainBot = getMainBot();

  for (const client of expired) {
    try {
      // Expire trial and pause bots
      await expireTrial(client.id);

      // Notify client
      const message = withFooter(`
⚠️ *Trial Expired*

Your ${PLATFORM.TRIAL_DAYS}-day free trial has ended.

Your selling bots have been paused. Existing subscriber subscriptions will continue until their individual expiration.

To continue using ${PLATFORM.NAME} and reactivate your bots, please upgrade to a paid plan.

Use /subscription to view available plans.
`);

      await safeSendMessage(mainBot, Number(client.telegramUserId), message, {
        parse_mode: 'HTML',
      });

      logger.info({ clientId: client.id }, 'Trial expired and client notified');
    } catch (error) {
      logger.error({ error, clientId: client.id }, 'Failed to process expired trial');
    }
  }
}

async function sendTrialReminders(): Promise<void> {
  const reminderDays = [5, 3, 1]; // Trial reminders
  const mainBot = getMainBot();
  let totalSent = 0;

  for (const days of reminderDays) {
    const expiring = await getExpiringTrials(days);

    for (const client of expiring) {
      try {
        // Check if already sent
        const alreadySent = await wasTrialReminderSent(client.id, days);
        if (alreadySent) {
          continue;
        }

        // Send reminder
        const message = getTrialReminderMessage(days, client.trialEndDate);
        const success = await safeSendMessage(
          mainBot,
          Number(client.telegramUserId),
          message,
          { parse_mode: 'HTML' }
        );

        await logTrialReminderSent(client.id, days, success);

        if (success) {
          totalSent++;
        }
      } catch (error) {
        logger.error({ error, clientId: client.id }, 'Failed to send trial reminder');
        await logTrialReminderSent(client.id, days, false, String(error));
      }
    }
  }

  if (totalSent > 0) {
    logger.info({ totalSent }, 'Trial reminders sent');
  }
}

function getTrialReminderMessage(daysLeft: number, expirationDate: Date): string {
  const emoji = daysLeft === 1 ? '🚨' : '⏰';

  return withFooter(`
${emoji} *Trial Ending Soon*

Your free trial ends in *${daysLeft} day${daysLeft > 1 ? 's' : ''}*.

📅 *End Date:* ${formatDate(expirationDate)}

After your trial ends:
• Your selling bots will be paused
• Existing subscribers keep access until their paid period ends
• You can reactivate anytime by upgrading

Upgrade now to ensure uninterrupted service!

Use /subscription to view plans.
`);
}
