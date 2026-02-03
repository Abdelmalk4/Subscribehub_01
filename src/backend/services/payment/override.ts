/**
 * Payment Override Service
 * Handles manual payment processing by admins
 */

import { supabase, type PaymentTransaction, type Subscriber, type SellingBot } from '../../../database/index.js';
import { createLogger } from '../../../shared/utils/index.js';
import { grantChannelAccess } from '../../services/access-control/index.js';
import { decrypt } from '../../../shared/utils/encryption.js';

const logger = createLogger('payment-override');

/**
 * Manually process a payment and grant access
 * Used by admins when webhooks fail
 */
export async function manuallyProcessPayment(
  transactionId: string,
  adminId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Get transaction details
    const { data: txData, error: txError } = await supabase
      .from('payment_transactions')
      .select(`
        *,
        subscribers(*),
        selling_bots:plan_id(bot_id, selling_bots(*))
      `)
      .eq('id', transactionId)
      .single();

    if (txError || !txData) {
      return { success: false, error: 'Transaction not found' };
    }

    const transaction = txData as any;

    // Verify transaction is not already confirmed
    if (transaction.payment_status === 'CONFIRMED') {
      return { success: false, error: 'Payment already confirmed' };
    }

    // Verify this is a subscriber payment (not platform payment)
    if (transaction.payment_type !== 'SUBSCRIBER_SUBSCRIPTION') {
      return { success: false, error: 'Can only manually process subscriber payments' };
    }

    if (!transaction.subscribers) {
      return { success: false, error: 'Subscriber not found' };
    }

    const subscriber = transaction.subscribers;
    const planId = transaction.plan_id;

    // Get plan details
    const { data: planData } = await supabase
      .from('subscription_plans')
      .select('duration_days')
      .eq('id', planId)
      .single();

    if (!planData) {
      return { success: false, error: 'Subscription plan not found' };
    }

    const plan = planData as { duration_days: number };

    // Calculate new end date
    const now = new Date();
    const endDate = new Date(now);
    endDate.setDate(endDate.getDate() + plan.duration_days);

    // Update transaction status
    await (supabase
      .from('payment_transactions') as any)
      .update({
        payment_status: 'CONFIRMED',
        confirmed_at: now.toISOString(),
      })
      .eq('id', transactionId);

    // Update subscriber subscription
    await (supabase
      .from('subscribers') as any)
      .update({
        subscription_status: 'ACTIVE',
        subscription_start_date: now.toISOString(),
        subscription_end_date: endDate.toISOString(),
        subscription_plan_id: planId,
      })
      .eq('id', subscriber.id);

    // Log manual action
    await (supabase.from('access_control_logs') as any).insert({
      subscriber_id: subscriber.id,
      bot_id: subscriber.bot_id,
      action: 'GRANT',
      performed_by: 'ADMIN',
      performer_id: adminId,
      reason: 'Manual payment override',
    });

    // Grant channel access
    const { data: botData } = await supabase
      .from('selling_bots')
      .select('*')
      .eq('id', subscriber.bot_id)
      .single();

    if (botData) {
      const bot = botData as SellingBot;
      
      if (bot.linked_channel_id) {
        let botToken = bot.bot_token;
        
        // Decrypt if needed
        if (botToken.includes(':')) {
          try {
            botToken = decrypt(botToken);
          } catch (e) {
            logger.error({ error: e, botId: bot.id }, 'Failed to decrypt bot token');
          }
        }

        await grantChannelAccess(
          subscriber.id,
          bot.id,
          Number(subscriber.telegram_user_id),
          Number(bot.linked_channel_id),
          botToken
        );
      }
    }

    logger.info({ 
      transactionId, 
      subscriberId: subscriber.id, 
      adminId 
    }, 'Payment manually processed');

    return { success: true };
  } catch (error) {
    logger.error({ error, transactionId, adminId }, 'Failed to manually process payment');
    return { success: false, error: String(error) };
  }
}
