/**
 * Join Request Handler (Supabase version)
 * Handles channel join requests from subscribers
 */

import { Bot } from 'grammy';
import type { SellingBotContext } from '../../../shared/types/index.js';
import { supabase, type Subscriber } from '../../../database/index.js';
import { sellingBotLogger as logger } from '../../../shared/utils/index.js';
import { handleJoinRequest as performAccessControlCheck } from '../../../backend/services/access-control/index.js';

export function setupJoinRequestHandler(bot: Bot<SellingBotContext>) {
  // Handle chat join requests
  bot.on('chat_join_request', async (ctx) => {
    const request = ctx.chatJoinRequest;
    if (!request) return;

    const botConfig = ctx.botConfig;
    if (!botConfig) {
      logger.error('Bot config not available for join request');
      return;
    }

    const channelId = Number(request.chat.id);
    const userId = Number(request.from.id);

    logger.info(
      { channelId, userId },
      'Processing join request'
    );

    // Check if this is our linked channel
    if (botConfig.linkedChannelId && Number(botConfig.linkedChannelId) !== channelId) {
      logger.debug('Join request not for linked channel, ignoring');
      return;
    }

    // Find subscriber
    try {
      const { data } = await supabase
        .from('subscribers')
        .select('id')
        .eq('bot_id', botConfig.id)
        .eq('telegram_user_id', userId)
        .single();

      const subscriber = data as Pick<Subscriber, 'id'> | null;

      if (!subscriber) {
        logger.info({ userId }, 'No subscriber record found');
        // Decline and message user
        try {
          await ctx.api.declineChatJoinRequest(channelId, userId);
          await ctx.api.sendMessage(
            userId,
            '❌ You need to subscribe first before joining the channel.\n\nUse /plans to view subscription options.'
          );
        } catch (e) {
          logger.error({ error: e }, 'Failed to decline join request');
        }
        return;
      }

      // Handle the join request using access control service
      const result = await performAccessControlCheck(
        subscriber.id,
        userId,
        channelId,
        botConfig.botToken
      );

      logger.info(
        { subscriberId: subscriber.id, result },
        'Join request processed'
      );
    } catch (error) {
      logger.error({ error, userId }, 'Error checking subscriber for join request');
    }
  });
}
