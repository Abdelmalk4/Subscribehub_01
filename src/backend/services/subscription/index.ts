/**
 * Subscription Service
 * Manages subscription state and lifecycle (Supabase version)
 */

import { supabase, type SubscriptionPlan, type Subscriber, type SellingBot } from '../../../database/index.js';
import { createLogger } from '../../../shared/utils/logger.js';
import { addDays } from '../../../shared/utils/date.js';

const logger = createLogger('subscription-service');

/**
 * Activate a subscription after payment confirmation
 */
export async function activateSubscription(
  subscriberId: string,
  planId: string
): Promise<boolean> {
  try {
    const { data } = await supabase
      .from('subscription_plans')
      .select('*')
      .eq('id', planId)
      .single();

    const plan = data as SubscriptionPlan | null;

    if (!plan) {
      logger.error({ subscriberId, planId }, 'Plan not found');
      return false;
    }

    const startDate = new Date();
    const endDate = addDays(startDate, plan.duration_days);

    await (supabase
      .from('subscribers') as any)
      .update({
        subscription_status: 'ACTIVE',
        subscription_start_date: startDate.toISOString(),
        subscription_end_date: endDate.toISOString(),
        subscription_plan_id: planId,
      })
      .eq('id', subscriberId);

    logger.info({ subscriberId, planId, endDate }, 'Subscription activated');
    return true;
  } catch (error) {
    logger.error({ error, subscriberId }, 'Failed to activate subscription');
    return false;
  }
}

/**
 * Extend an existing subscription
 */
export async function extendSubscription(
  subscriberId: string,
  days: number
): Promise<Date | null> {
  try {
    const { data } = await supabase
      .from('subscribers')
      .select('subscription_end_date')
      .eq('id', subscriberId)
      .single();

    const subscriber = data as Pick<Subscriber, 'subscription_end_date'> | null;

    if (!subscriber) return null;

    // Start from current end date or now
    const baseDate = subscriber.subscription_end_date
      ? new Date(subscriber.subscription_end_date)
      : new Date();
    const newEndDate = addDays(baseDate, days);

    await (supabase
      .from('subscribers') as any)
      .update({
        subscription_status: 'ACTIVE',
        subscription_end_date: newEndDate.toISOString(),
      })
      .eq('id', subscriberId);

    logger.info({ subscriberId, days, newEndDate }, 'Subscription extended');
    return newEndDate;
  } catch (error) {
    logger.error({ error, subscriberId }, 'Failed to extend subscription');
    return null;
  }
}

/**
 * Expire a subscription
 */
export async function expireSubscription(subscriberId: string): Promise<boolean> {
  try {
    await (supabase
      .from('subscribers') as any)
      .update({ subscription_status: 'EXPIRED' })
      .eq('id', subscriberId);

    logger.info({ subscriberId }, 'Subscription expired');
    return true;
  } catch (error) {
    logger.error({ error, subscriberId }, 'Failed to expire subscription');
    return false;
  }
}

/**
 * Get expired subscriptions that need processing
 */
export async function getExpiredSubscriptions() {
  const { data } = await supabase
    .from('subscribers')
    .select(`
      id,
      telegram_user_id,
      selling_bots (
        id,
        bot_token,
        linked_channel_id
      )
    `)
    .eq('subscription_status', 'ACTIVE')
    .lt('subscription_end_date', new Date().toISOString());

  const typedData = data as Array<{
    id: string;
    telegram_user_id: number;
    selling_bots: {
      id: string;
      bot_token: string;
      linked_channel_id: number | null;
    } | null;
  }> | null;

  return typedData?.map((sub) => ({
    id: sub.id,
    telegramUserId: sub.telegram_user_id,
    bot: sub.selling_bots,
  })) || [];
}

/**
 * Get subscriptions expiring in N days (for reminders)
 */
export async function getExpiringSubscriptions(days: number) {
  const now = new Date();
  const targetDate = addDays(now, days);
  const nextDay = addDays(targetDate, 1);

  const { data } = await supabase
    .from('subscribers')
    .select(`
      id,
      telegram_user_id,
      subscription_end_date,
      selling_bots (
        id,
        bot_token
      )
    `)
    .eq('subscription_status', 'ACTIVE')
    .gte('subscription_end_date', targetDate.toISOString())
    .lt('subscription_end_date', nextDay.toISOString());

  const typedData = data as Array<{
    id: string;
    telegram_user_id: number;
    subscription_end_date: string | null;
    selling_bots: {
      id: string;
      bot_token: string;
    } | null;
  }> | null;

  return typedData?.map((sub) => ({
    id: sub.id,
    telegramUserId: sub.telegram_user_id,
    subscriptionEndDate: new Date(sub.subscription_end_date!),
    bot: sub.selling_bots,
  })) || [];
}

/**
 * Check if reminder was already sent
 */
export async function wasReminderSent(
  subscriberId: string,
  daysRemaining: number
): Promise<boolean> {
  const yesterday = addDays(new Date(), -1);

  const { data } = await supabase
    .from('notification_logs')
    .select('id')
    .eq('recipient_type', 'subscriber')
    .eq('recipient_id', subscriberId)
    .eq('notification_type', 'renewal_reminder')
    .eq('days_remaining', daysRemaining)
    .gte('sent_at', yesterday.toISOString())
    .limit(1);

  return (data?.length || 0) > 0;
}

/**
 * Log sent reminder
 */
export async function logReminderSent(
  subscriberId: string,
  daysRemaining: number,
  success: boolean,
  errorMessage?: string
): Promise<void> {
  await (supabase.from('notification_logs') as any).insert({
    recipient_type: 'subscriber',
    recipient_id: subscriberId,
    notification_type: 'renewal_reminder',
    days_remaining: daysRemaining,
    success,
    error_message: errorMessage,
  });
}
