/**
 * Client Middleware
 * Loads client data from Supabase if user is registered
 */

import { Middleware } from 'grammy';
import { supabase, type Client } from '../../database/index.js';
import type { MainBotContext } from '../../shared/types/index.js';
import { mainBotLogger as logger, MessageBuilder } from '../../shared/utils/index.js';

export function setupClientMiddleware(): Middleware<MainBotContext> {
  return async (ctx, next) => {
    if (ctx.from) {
      try {
        const { data } = await supabase
          .from('clients')
          .select('*')
          .eq('telegram_user_id', ctx.from.id)
          .single();

        const client = data as Client | null;

        if (client) {
          ctx.client = {
            id: client.id,
            telegramUserId: BigInt(client.telegram_user_id),
            username: client.username ?? undefined,
            businessName: client.business_name,
            status: client.status as any,
            trialStartDate: client.trial_start_date ? new Date(client.trial_start_date) : undefined,
            trialEndDate: client.trial_end_date ? new Date(client.trial_end_date) : undefined,
            trialActivated: client.trial_activated,
            platformSubscriptionEnd: client.platform_subscription_end
              ? new Date(client.platform_subscription_end)
              : undefined,
            subscriptionPlanId: client.platform_subscription_plan_id ?? undefined,
          };
        }
      } catch (error) {
        // No client found is not an error
        if ((error as any)?.code !== 'PGRST116') {
          logger.error({ error, userId: ctx.from.id }, 'Failed to load client data');
        }
      }
    }
    await next();
  };
}

/**
 * Guard: Only allow registered clients
 */
export function clientOnly(): Middleware<MainBotContext> {
  return async (ctx, next) => {
    if (!ctx.client) {
      const message = new MessageBuilder()
        .header('❌', 'Registration Required')
        .break()
        .line('You are not registered yet.')
        .line('Use /start to create your account.')
        .toString();

      await ctx.reply(message, { parse_mode: 'HTML' });
      return;
    }
    await next();
  };
}

/**
 * Guard: Only allow active clients (trial or paid)
 */
export function activeClientOnly(): Middleware<MainBotContext> {
  return async (ctx, next) => {
    if (!ctx.client) {
      await ctx.reply('❌ You need to register first. Use /start');
      return;
    }

    const { status } = ctx.client;
    if (status === 'PENDING') {
      await ctx.reply('⏳ Your account is pending approval. Please wait for verification.');
      return;
    }
    if (status === 'SUSPENDED') {
      await ctx.reply('🚫 Your account has been suspended. Contact support for assistance.');
      return;
    }
    if (status === 'EXPIRED') {
      const message = new MessageBuilder()
        .header('⚠️', 'Subscription Expired')
        .break()
        .line('Your subscription has expired.')
        .line('Please renew to continue using the platform.')
        .toString();

      await ctx.reply(message, { parse_mode: 'HTML' });
      return;
    }

    await next();
  };
}
