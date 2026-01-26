/**
 * Expiration Check Job
 * Runs hourly to process expired subscriptions
 */

import { cronLogger as logger } from '../../shared/utils/index.js';
import { getExpiredSubscriptions, expireSubscription } from '../services/subscription/index.js';
import { revokeChannelAccess } from '../services/access-control/index.js';

export async function runExpirationCheck(): Promise<void> {
  try {
    const expired = await getExpiredSubscriptions();

    if (expired.length === 0) {
      logger.debug('No expired subscriptions found');
      return;
    }

    logger.info({ count: expired.length }, 'Processing expired subscriptions');

    for (const sub of expired) {
      try {
        // Expire the subscription
        await expireSubscription(sub.id);

        // Revoke channel access if linked
        if (sub.bot && sub.bot.linked_channel_id) {
          await revokeChannelAccess(
            sub.id,
            sub.bot.id,
            sub.telegramUserId,
            Number(sub.bot.linked_channel_id),
            sub.bot.bot_token,
            'Subscription expired'
          );
        }

        logger.debug({ subscriberId: sub.id }, 'Subscription expired and access revoked');
      } catch (error) {
        logger.error({ error, subscriberId: sub.id }, 'Failed to process expired subscription');
      }
    }

    logger.info({ processed: expired.length }, 'Expiration check completed');
  } catch (error) {
    logger.error({ error }, 'Expiration check job failed');
  }
}
