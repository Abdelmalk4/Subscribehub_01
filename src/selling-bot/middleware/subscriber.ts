/**
 * Subscriber Middleware (Supabase version)
 * Loads or creates subscriber record from Supabase
 */

import { Middleware } from 'grammy';
import { supabase, type Subscriber } from '../../database/index.js';
import { sellingBotLogger as logger } from '../../shared/utils/index.js';
import type { SellingBotContext } from '../../shared/types/index.js';

export function setupSubscriberMiddleware(): Middleware<SellingBotContext> {
  return async (ctx, next) => {
    if (!ctx.from || !ctx.botConfig) {
      await next();
      return;
    }

    const telegramUserId = ctx.from.id;
    const botId = ctx.botConfig.id;

    try {
      // Find subscriber
      let { data } = await supabase
        .from('subscribers')
        .select('*')
        .eq('telegram_user_id', telegramUserId)
        .eq('bot_id', botId)
        .single();

      let subscriber = data as Subscriber | null;

      // Create new subscriber if not exists
      if (!subscriber) {
        const { data: newSubData, error } = await (supabase
          .from('subscribers') as any)
          .insert({
            telegram_user_id: telegramUserId,
            bot_id: botId,
            username: ctx.from.username ?? null,
            first_name: ctx.from.first_name ?? null,
            last_name: ctx.from.last_name ?? null,
            subscription_status: 'PENDING_PAYMENT',
          })
          .select()
          .single();

        if (error) throw error;
        subscriber = newSubData as Subscriber;

        logger.info(
          { subscriberId: subscriber.id, botId, telegramUserId },
          'New subscriber created'
        );
      }

      ctx.subscriber = {
        id: subscriber.id,
        telegramUserId: BigInt(subscriber.telegram_user_id),
        username: subscriber.username ?? undefined,
        firstName: subscriber.first_name ?? undefined,
        lastName: subscriber.last_name ?? undefined,
        botId: subscriber.bot_id,
        subscriptionStatus: subscriber.subscription_status as any,
        subscriptionStartDate: subscriber.subscription_start_date
          ? new Date(subscriber.subscription_start_date)
          : undefined,
        subscriptionEndDate: subscriber.subscription_end_date
          ? new Date(subscriber.subscription_end_date)
          : undefined,
        subscriptionPlanId: subscriber.subscription_plan_id ?? undefined,
      };

      await next();
    } catch (error) {
      // Handle "no rows" error gracefully
      if ((error as any)?.code !== 'PGRST116') {
        logger.error({ error, telegramUserId, botId }, 'Failed to load subscriber');
      }
      await next();
    }
  };
}

/**
 * Guard: Only allow active subscribers
 */
export function activeSubscriberOnly(): Middleware<SellingBotContext> {
  return async (ctx, next) => {
    if (!ctx.subscriber || ctx.subscriber.subscriptionStatus !== 'ACTIVE') {
      await ctx.reply(
        '❌ You need an active subscription to access this.\n\n' +
        'Use /plans to view available subscription options.'
      );
      return;
    }
    await next();
  };
}
