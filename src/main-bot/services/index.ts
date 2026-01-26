/**
 * Main Bot Services (Supabase version)
 * Business logic for client and bot management
 */

import { supabase, type SellingBot, type Subscriber, type PaymentTransaction, type SubscriptionPlan } from '../../database/index.js';
import { createLogger } from '../../shared/utils/logger.js';
import { addDays } from '../../shared/utils/date.js';

const logger = createLogger('main-bot-service');

/**
 * Get client statistics
 */
export async function getClientStats(clientId: string) {
  const [
    botsCountRes,
    activeSubscribersRes,
    revenueRes
  ] = await Promise.all([
    supabase.from('selling_bots').select('*', { count: 'exact', head: true }).eq('client_id', clientId),
    supabase.from('subscribers')
      .select('id', { count: 'exact', head: true })
      .eq('subscription_status', 'ACTIVE')
      .filter('selling_bots.client_id', 'eq', clientId),
    supabase.from('payment_transactions')
      .select('amount')
      .eq('payment_type', 'SUBSCRIBER_SUBSCRIPTION')
      .eq('payment_status', 'CONFIRMED')
      .filter('subscribers.selling_bots.client_id', 'eq', clientId),
  ]);

  const totalRevenue = (revenueRes.data as any[])?.reduce((sum, item) => sum + Number(item.amount), 0) || 0;

  return {
    botsCount: botsCountRes.count || 0,
    activeSubscribers: activeSubscribersRes.count || 0,
    totalRevenue,
  };
}

/**
 * Get bot statistics
 */
export async function getBotStats(botId: string) {
  const [
    totalSubscribersRes,
    activeSubscribersRes,
    expiredSubscribersRes,
    revenueRes,
    recentPaymentsRes,
  ] = await Promise.all([
    supabase.from('subscribers').select('*', { count: 'exact', head: true }).eq('bot_id', botId),
    supabase.from('subscribers').select('*', { count: 'exact', head: true }).eq('bot_id', botId).eq('subscription_status', 'ACTIVE'),
    supabase.from('subscribers').select('*', { count: 'exact', head: true }).eq('bot_id', botId).eq('subscription_status', 'EXPIRED'),
    supabase.from('payment_transactions')
      .select('amount')
      .eq('payment_status', 'CONFIRMED')
      .filter('subscribers.bot_id', 'eq', botId),
    supabase.from('payment_transactions').select('*', { count: 'exact', head: true })
      .eq('payment_status', 'CONFIRMED')
      .filter('subscribers.bot_id', 'eq', botId)
      .gte('confirmed_at', addDays(new Date(), -30).toISOString()),
  ]);

  const totalRevenue = (revenueRes.data as any[])?.reduce((sum, item) => sum + Number(item.amount), 0) || 0;

  return {
    totalSubscribers: totalSubscribersRes.count || 0,
    activeSubscribers: activeSubscribersRes.count || 0,
    expiredSubscribers: expiredSubscribersRes.count || 0,
    totalRevenue,
    last30DaysPayments: recentPaymentsRes.count || 0,
  };
}

/**
 * Update bot settings
 */
export async function updateBotSettings(
  botId: string,
  settings: {
    welcomeMessage?: string;
    linkedChannelId?: bigint;
    linkedChannelUsername?: string;
  }
) {
  const updateData: any = {};
  if (settings.welcomeMessage) updateData.welcome_message = settings.welcomeMessage;
  if (settings.linkedChannelId) updateData.linked_channel_id = Number(settings.linkedChannelId);
  if (settings.linkedChannelUsername) updateData.linked_channel_username = settings.linkedChannelUsername;

  return (supabase
    .from('selling_bots') as any)
    .update(updateData)
    .eq('id', botId);
}

/**
 * Create subscription plan
 */
export async function createPlan(
  botId: string,
  data: {
    name: string;
    description?: string;
    durationDays: number;
    priceAmount: number;
    priceCurrency: string;
  }
) {
  const { data: planData, error } = await (supabase
    .from('subscription_plans') as any)
    .insert({
      bot_id: botId,
      plan_type: 'CLIENT',
      name: data.name,
      description: data.description,
      duration_days: data.durationDays,
      price_amount: data.priceAmount,
      price_currency: data.priceCurrency.toUpperCase(),
      is_active: true,
    })
    .select()
    .single();

  if (error) {
    logger.error({ error, botId }, 'Failed to create plan');
    throw error;
  }

  const plan = planData as SubscriptionPlan;

  logger.info({ planId: plan.id, botId, name: plan.name }, 'Plan created');
  return plan;
}

/**
 * Toggle plan active status
 */
export async function togglePlanStatus(planId: string): Promise<boolean> {
  const { data } = await supabase
    .from('subscription_plans')
    .select('is_active')
    .eq('id', planId)
    .single();

  const plan = data as Pick<SubscriptionPlan, 'is_active'> | null;

  if (!plan) return false;

  await (supabase
    .from('subscription_plans') as any)
    .update({ is_active: !plan.is_active })
    .eq('id', planId);

  return true;
}
