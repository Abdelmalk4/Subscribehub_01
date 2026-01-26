/**
 * Trial Management Service
 * Manages client trial periods (Supabase version)
 */

import { supabase, type Client, type SellingBot } from '../../../database/index.js';
import { createLogger } from '../../../shared/utils/logger.js';
import { addDays } from '../../../shared/utils/date.js';
import { PLATFORM } from '../../../shared/config/index.js';

const logger = createLogger('trial-service');

/**
 * Activate trial for a client
 */
export async function activateTrial(clientId: string): Promise<boolean> {
  try {
    const { data } = await supabase
      .from('clients')
      .select('trial_activated')
      .eq('id', clientId)
      .single();

    const client = data as Pick<Client, 'trial_activated'> | null;

    if (!client) {
      logger.error({ clientId }, 'Client not found');
      return false;
    }

    if (client.trial_activated) {
      logger.warn({ clientId }, 'Trial already activated');
      return false;
    }

    const startDate = new Date();
    const endDate = addDays(startDate, PLATFORM.TRIAL_DAYS);

    await (supabase
      .from('clients') as any)
      .update({
        status: 'TRIAL',
        trial_activated: true,
        trial_start_date: startDate.toISOString(),
        trial_end_date: endDate.toISOString(),
      })
      .eq('id', clientId);

    logger.info({ clientId, endDate }, 'Trial activated');
    return true;
  } catch (error) {
    logger.error({ error, clientId }, 'Failed to activate trial');
    return false;
  }
}

/**
 * Get clients with expiring trials
 */
export async function getExpiringTrials(days: number) {
  const now = new Date();
  const targetDate = addDays(now, days);
  const nextDay = addDays(targetDate, 1);

  const { data } = await supabase
    .from('clients')
    .select('id, telegram_user_id, trial_end_date, business_name')
    .eq('status', 'TRIAL')
    .gte('trial_end_date', targetDate.toISOString())
    .lt('trial_end_date', nextDay.toISOString());

  const typedData = data as Array<Pick<Client, 'id' | 'telegram_user_id' | 'trial_end_date' | 'business_name'>> | null;

  return typedData?.map((c) => ({
    id: c.id,
    telegramUserId: c.telegram_user_id,
    trialEndDate: new Date(c.trial_end_date!),
    businessName: c.business_name,
  })) || [];
}

/**
 * Get expired trials that need processing
 */
export async function getExpiredTrials() {
  const { data } = await supabase
    .from('clients')
    .select(`
      id,
      telegram_user_id,
      business_name,
      selling_bots (id)
    `)
    .eq('status', 'TRIAL')
    .lt('trial_end_date', new Date().toISOString());

  const typedData = data as Array<{
    id: string;
    telegram_user_id: number;
    business_name: string;
    selling_bots: Array<{ id: string }> | null;
  }> | null;

  return typedData?.map((c) => ({
    id: c.id,
    telegramUserId: c.telegram_user_id,
    businessName: c.business_name,
    sellingBots: c.selling_bots || [],
  })) || [];
}

/**
 * Expire a trial and pause all bots
 */
export async function expireTrial(clientId: string): Promise<boolean> {
  try {
    // Update client status
    await (supabase
      .from('clients') as any)
      .update({ status: 'EXPIRED' })
      .eq('id', clientId);

    // Pause all selling bots
    await (supabase
      .from('selling_bots') as any)
      .update({ status: 'PAUSED' })
      .eq('client_id', clientId)
      .eq('status', 'ACTIVE');

    logger.info({ clientId }, 'Trial expired, bots paused');
    return true;
  } catch (error) {
    logger.error({ error, clientId }, 'Failed to expire trial');
    return false;
  }
}

/**
 * Check if reminder was already sent
 */
export async function wasTrialReminderSent(
  clientId: string,
  daysRemaining: number
): Promise<boolean> {
  const yesterday = addDays(new Date(), -1);

  const { data } = await supabase
    .from('notification_logs')
    .select('id')
    .eq('recipient_type', 'client')
    .eq('recipient_id', clientId)
    .eq('notification_type', 'trial_reminder')
    .eq('days_remaining', daysRemaining)
    .gte('sent_at', yesterday.toISOString())
    .limit(1);

  return (data?.length || 0) > 0;
}

/**
 * Log sent trial reminder
 */
export async function logTrialReminderSent(
  clientId: string,
  daysRemaining: number,
  success: boolean,
  errorMessage?: string
): Promise<void> {
  await (supabase.from('notification_logs') as any).insert({
    recipient_type: 'client',
    recipient_id: clientId,
    notification_type: 'trial_reminder',
    days_remaining: daysRemaining,
    success,
    error_message: errorMessage,
  });
}
