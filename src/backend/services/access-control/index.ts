/**
 * Access Control Service
 * Manages channel/group access for subscribers (Supabase version)
 */

import { Bot } from 'grammy';
import { supabase, type Subscriber, type SellingBot } from '../../../database/index.js';
import { accessLogger as logger } from '../../../shared/utils/index.js';
import {
  createChannelInviteLink,
  removeUserFromChannel,
  approveJoinRequest as telegramApproveJoinRequest,
  safeSendMessage,
} from '../../../shared/integrations/telegram.js';
import { formatDate } from '../../../shared/utils/date.js';
import { withFooter } from '../../../shared/utils/format.js';

/**
 * Grant channel access to a subscriber
 */
export async function grantChannelAccess(
  subscriberId: string,
  botId: string,
  telegramUserId: number,
  channelId: number,
  botToken: string
): Promise<boolean> {
  try {
    const bot = new Bot(botToken);

    // Create single-use invite link
    const inviteLink = await createChannelInviteLink(bot, channelId, {
      name: `Sub ${subscriberId.slice(0, 8)}`,
      memberLimit: 1,
    });

    // Get subscriber for end date
    const { data } = await supabase
      .from('subscribers')
      .select('subscription_end_date')
      .eq('id', subscriberId)
      .single();

    const subscriber = data as Pick<Subscriber, 'subscription_end_date'> | null;

    // Send invite to subscriber
    const message = withFooter(`
✅ *Payment Confirmed!*

Your subscription is now active!

🔗 *Join the channel:* [Click here](${inviteLink})

📅 *Expires:* ${subscriber?.subscription_end_date ? formatDate(new Date(subscriber.subscription_end_date)) : 'N/A'}

Enjoy your premium access!
`);

    await safeSendMessage(bot, telegramUserId, message, {
      parse_mode: 'Markdown',
    });

    logger.info({ subscriberId, channelId }, 'Channel access granted');
    return true;
  } catch (error) {
    logger.error({ error, subscriberId, channelId }, 'Failed to grant channel access');
    return false;
  }
}

/**
 * Revoke channel access from a subscriber
 */
export async function revokeChannelAccess(
  subscriberId: string,
  botId: string,
  telegramUserId: number,
  channelId: number,
  botToken: string,
  reason: string = 'Subscription expired'
): Promise<boolean> {
  try {
    const bot = new Bot(botToken);

    // Remove from channel
    const removed = await removeUserFromChannel(bot, channelId, telegramUserId);

    if (removed) {
      // Notify subscriber
      const message = withFooter(`
⚠️ *Subscription Expired*

Your access to the premium channel has ended.

${reason}

To continue enjoying premium content, please renew your subscription.

Use /plans to view available options.
`);

      await safeSendMessage(bot, telegramUserId, message, {
        parse_mode: 'Markdown',
      });

      // Log revocation
      await (supabase.from('access_control_logs') as any).insert({
        subscriber_id: subscriberId,
        bot_id: botId,
        action: 'REVOKE',
        performed_by: 'SYSTEM',
        reason,
      });

      logger.info({ subscriberId, channelId, reason }, 'Channel access revoked');
    }

    return removed;
  } catch (error) {
    logger.error({ error, subscriberId, channelId }, 'Failed to revoke channel access');
    return false;
  }
}

/**
 * Handle join request for a channel
 */
export async function handleJoinRequest(
  subscriberId: string,
  telegramUserId: number,
  channelId: number,
  botToken: string
): Promise<'approved' | 'declined' | 'error'> {
  try {
    const bot = new Bot(botToken);

    // Check if subscriber has active subscription
    const { data } = await supabase
      .from('subscribers')
      .select('*, selling_bots(*)')
      .eq('id', subscriberId)
      .single();

    const subscriber = data as (Subscriber & { selling_bots: SellingBot }) | null;

    if (!subscriber) {
      return 'error';
    }

    const isActive =
      subscriber.subscription_status === 'ACTIVE' &&
      subscriber.subscription_end_date &&
      new Date(subscriber.subscription_end_date) > new Date();

    if (isActive) {
      await telegramApproveJoinRequest(bot, channelId, telegramUserId);
      logger.info({ subscriberId, channelId }, 'Join request approved');
      return 'approved';
    } else {
      const message = withFooter(`
❌ *Join Request Declined*

You don't have an active subscription.

Use /plans to view subscription options.
`);

      await safeSendMessage(bot, telegramUserId, message, {
        parse_mode: 'Markdown',
      });

      logger.info({ subscriberId, channelId }, 'Join request declined - no active subscription');
      return 'declined';
    }
  } catch (error) {
    logger.error({ error, subscriberId, channelId }, 'Failed to handle join request');
    return 'error';
  }
}

/**
 * Manually extend subscriber access
 */
export async function manualExtendAccess(
  subscriberId: string,
  days: number,
  performerId: string,
  performerType: 'CLIENT' | 'ADMIN',
  reason?: string
): Promise<boolean> {
  try {
    const { data } = await supabase
      .from('subscribers')
      .select('*, selling_bots(*)')
      .eq('id', subscriberId)
      .single();

    const subscriber = data as (Subscriber & { selling_bots: SellingBot }) | null;

    if (!subscriber) return false;

    // Calculate new end date
    const currentEnd = subscriber.subscription_end_date
      ? new Date(subscriber.subscription_end_date)
      : new Date();
    const newEndDate = new Date(currentEnd);
    newEndDate.setDate(newEndDate.getDate() + days);

    // Update subscriber
    await (supabase
      .from('subscribers') as any)
      .update({
        subscription_status: 'ACTIVE',
        subscription_end_date: newEndDate.toISOString(),
      })
      .eq('id', subscriberId);

    // Log action
    await (supabase.from('access_control_logs') as any).insert({
      subscriber_id: subscriberId,
      bot_id: subscriber.bot_id,
      action: 'MANUAL_EXTEND',
      performed_by: performerType,
      performer_id: performerId,
      reason: reason || `Extended by ${days} days`,
    });

    logger.info({ subscriberId, days, performerId, newEndDate }, 'Subscription manually extended');
    return true;
  } catch (error) {
    logger.error({ error, subscriberId }, 'Failed to extend access');
    return false;
  }
}

/**
 * Manually revoke subscriber access
 */
export async function manualRevokeAccess(
  subscriberId: string,
  performerId: string,
  performerType: 'CLIENT' | 'ADMIN',
  reason: string
): Promise<boolean> {
  try {
    const { data } = await supabase
      .from('subscribers')
      .select('*, selling_bots(*)')
      .eq('id', subscriberId)
      .single();

    const subscriber = data as (Subscriber & { selling_bots: SellingBot }) | null;

    if (!subscriber || !subscriber.selling_bots) return false;

    // Update status
    await (supabase
      .from('subscribers') as any)
      .update({ subscription_status: 'REVOKED' })
      .eq('id', subscriberId);

    // Revoke channel access
    const bot = subscriber.selling_bots;
    if (bot.linked_channel_id) {
      await revokeChannelAccess(
        subscriberId,
        subscriber.bot_id,
        subscriber.telegram_user_id,
        bot.linked_channel_id,
        bot.bot_token,
        reason
      );
    }

    // Log action
    await (supabase.from('access_control_logs') as any).insert({
      subscriber_id: subscriberId,
      bot_id: subscriber.bot_id,
      action: 'MANUAL_REVOKE',
      performed_by: performerType,
      performer_id: performerId,
      reason,
    });

    logger.info({ subscriberId, performerId, reason }, 'Access manually revoked');
    return true;
  } catch (error) {
    logger.error({ error, subscriberId }, 'Failed to revoke access');
    return false;
  }
}
