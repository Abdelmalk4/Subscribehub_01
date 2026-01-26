/**
 * Bot Config Middleware (Supabase version)
 * Loads selling bot configuration from Supabase
 */

import { Middleware } from 'grammy';
import { supabase, type SellingBot, type Client } from '../../database/index.js';
import { sellingBotLogger as logger } from '../../shared/utils/index.js';
import type { SellingBotContext, SellingBotConfig } from '../../shared/types/index.js';

export function setupBotConfigMiddleware(botId: string): Middleware<SellingBotContext> {
  return async (ctx, next) => {
    try {
      const { data, error } = await supabase
        .from('selling_bots')
        .select(`
          *,
          clients (status)
        `)
        .eq('id', botId)
        .single();

      const botConfig = data as (SellingBot & { clients: Pick<Client, 'status'> }) | null;

      if (error || !botConfig) {
        logger.error({ botId, error }, 'Bot config not found');
        await ctx.reply('❌ Bot configuration error. Please contact support.');
        return;
      }

      // Check if bot is paused
      if (botConfig.status === 'PAUSED') {
        await ctx.reply(
          '⏸️ This bot is temporarily unavailable.\n\n' +
          'Please try again later or contact the channel owner.'
        );
        return;
      }

      // Check if client is active
      const clientStatus = botConfig.clients?.status;
      if (!['ACTIVE', 'TRIAL'].includes(clientStatus)) {
        await ctx.reply(
          '⚠️ This service is currently unavailable.\n\n' +
          'Please contact the channel owner for assistance.'
        );
        return;
      }

      ctx.botConfig = {
        id: botConfig.id,
        clientId: botConfig.client_id,
        botToken: botConfig.bot_token,
        botUsername: botConfig.bot_username || '',
        botName: botConfig.bot_name ?? undefined,
        nowpaymentsApiKey: botConfig.nowpayments_api_key,
        cryptoWalletAddress: botConfig.crypto_wallet_address,
        linkedChannelId: botConfig.linked_channel_id
          ? BigInt(botConfig.linked_channel_id)
          : undefined,
        linkedChannelUsername: botConfig.linked_channel_username ?? undefined,
        welcomeMessage: botConfig.welcome_message ?? undefined,
        status: botConfig.status as SellingBotConfig['status'],
      };

      await next();
    } catch (error) {
      logger.error({ error, botId }, 'Failed to load bot config');
      await ctx.reply('❌ An error occurred. Please try again.');
    }
  };
}
