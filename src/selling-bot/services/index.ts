/**
 * Selling Bot Services (Supabase version)
 * Business logic for subscriber management
 */

import { supabase, type Subscriber, type SubscriptionPlan, type PaymentTransaction, type SellingBot } from '../../database/index.js';
import { createLogger } from '../../shared/utils/logger.js';

const logger = createLogger('selling-bot-service');

/**
 * Get or create subscriber
 */
export async function getOrCreateSubscriber(
  botId: string,
  telegramUserId: bigint,
  userData: {
    username?: string;
    firstName?: string;
    lastName?: string;
  }
) {
  let { data } = await supabase
    .from('subscribers')
    .select('*')
    .eq('telegram_user_id', Number(telegramUserId))
    .eq('bot_id', botId)
    .single();

  let subscriber = data as Subscriber | null;

  if (!subscriber) {
    const { data: newSubData, error } = await (supabase
      .from('subscribers') as any)
      .insert({
        telegram_user_id: Number(telegramUserId),
        bot_id: botId,
        username: userData.username ?? null,
        first_name: userData.firstName ?? null,
        last_name: userData.lastName ?? null,
        subscription_status: 'PENDING_PAYMENT',
      })
      .select()
      .single();

    if (error) {
      logger.error({ error, botId, telegramUserId }, 'Failed to create subscriber');
      throw error;
    }
    subscriber = newSubData as Subscriber;
    logger.info({ subscriberId: subscriber.id, botId }, 'New subscriber created');
  }

  return subscriber;
}

/**
 * Get subscriber with full details
 */
export async function getSubscriberDetails(subscriberId: string) {
  const { data, error } = await supabase
    .from('subscribers')
    .select('*, subscription_plans(*), selling_bots(bot_username, linked_channel_username), payment_transactions(*)')
    .eq('id', subscriberId)
    .single();

  const subscriber = data as (Subscriber & { 
    subscription_plans: SubscriptionPlan | null; 
    selling_bots: Pick<SellingBot, 'bot_username' | 'linked_channel_username'>;
    payment_transactions: PaymentTransaction[];
  }) | null;

  if (error) return null;
  return subscriber;
}

/**
 * Get active plans for a bot
 */
export async function getActivePlans(botId: string) {
  const { data } = await supabase
    .from('subscription_plans')
    .select('*')
    .eq('bot_id', botId)
    .eq('plan_type', 'CLIENT')
    .eq('is_active', true)
    .order('price_amount', { ascending: true });

  const plans = data as SubscriptionPlan[] | null;
  return plans || [];
}

/**
 * Get pending payment for subscriber
 */
export async function getPendingPayment(subscriberId: string) {
  const { data } = await supabase
    .from('payment_transactions')
    .select('*, subscription_plans(*)')
    .eq('subscriber_id', subscriberId)
    .in('payment_status', ['PENDING', 'CONFIRMING'])
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  const transaction = data as (PaymentTransaction & { subscription_plans: SubscriptionPlan }) | null;
  return transaction;
}

/**
 * Check if subscriber has active subscription
 */
export async function hasActiveSubscription(subscriberId: string): Promise<boolean> {
  const { data } = await supabase
    .from('subscribers')
    .select('subscription_status, subscription_end_date')
    .eq('id', subscriberId)
    .single();

  const subscriber = data as Pick<Subscriber, 'subscription_status' | 'subscription_end_date'> | null;

  if (!subscriber) return false;

  return (
    subscriber.subscription_status === 'ACTIVE' &&
    subscriber.subscription_end_date !== null &&
    new Date(subscriber.subscription_end_date) > new Date()
  );
}
