/**
 * Client Middleware
 * Loads client data from Supabase if user is registered
 */

import { Middleware } from 'grammy';
import { supabase, type Client } from '../../database/index.js';
import type { MainBotContext } from '../../shared/types/index.js';
import { mainBotLogger as logger } from '../../shared/utils/index.js';

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
      await ctx.reply(
        '❌ You are not registered yet.\n\n' +
        'Use /start to create your account.'
      );
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
      await ctx.reply(
        '⚠️ Your subscription has expired.\n\n' +
        'Please renew to continue using the platform.'
      );
      return;
    }

    await next();
  };
}
