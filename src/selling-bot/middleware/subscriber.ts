/**
 * Subscriber Middleware (Supabase version)
 * Loads or creates subscriber record from Supabase
 */

import { Middleware } from 'grammy';
import { supabase, type Subscriber } from '../../database/index.js';
import { sellingBotLogger as logger, MessageBuilder } from '../../shared/utils/index.js';
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
        // Enforce max_subscribers limit from client's subscription plan
        const { data: botData } = await supabase
          .from('selling_bots')
          .select('client_id')
          .eq('id', botId)
          .single();
        
        if (botData) {
          const { data: clientData } = await supabase
            .from('clients')
            .select('subscription_plan_id')
            .eq('id', (botData as { client_id: string }).client_id)
            .single();
          
          const planId = (clientData as { subscription_plan_id: string | null } | null)?.subscription_plan_id;
          
          if (planId) {
            const { data: plan } = await supabase
              .from('subscription_plans')
              .select('max_subscribers')
              .eq('id', planId)
              .single();
            
            const maxSubscribers = (plan as { max_subscribers: number | null } | null)?.max_subscribers;
            
            if (maxSubscribers) {
              const { count: currentSubCount } = await supabase
                .from('subscribers')
                .select('*', { count: 'exact', head: true })
                .eq('bot_id', botId);
              
              if (currentSubCount !== null && currentSubCount >= maxSubscribers) {
                logger.warn({ botId, currentSubCount, maxSubscribers }, 'Subscriber limit reached');
                const message = new MessageBuilder()
                  .header('❌', 'Subscriber Limit Reached')
                  .break()
                  .line('This bot has reached its subscriber limit.')
                  .line('Please contact the owner for assistance.')
                  .toString();

                await ctx.reply(message, { parse_mode: 'HTML' });
                return;
              }
            }
          }
        }

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
      const message = new MessageBuilder()
        .header('❌', 'Active Subscription Required')
        .break()
        .line('You need an active subscription to access this.')
        .line('Use /plans to view available subscription options.')
        .toString();

      await ctx.reply(message, { parse_mode: 'HTML' });
      return;
    }
    await next();
  };
}
