/**
 * Notification Service
 * Handles notifications to clients via Main Bot
 */

import { Bot } from 'grammy';
import { config } from '../../../shared/config/index.js';
import { safeSendMessage } from '../../../shared/integrations/telegram.js';
import { MessageBuilder, createLogger } from '../../../shared/utils/index.js';

const logger = createLogger('notification');

/**
 * Notify client when a new subscriber starts their Selling Bot
 */
export async function notifyClientOfNewSubscriber(
  clientTelegramId: number,
  subscriberInfo: {
    username?: string;
    firstName?: string;
    telegramUserId: number;
  },
  botName: string
): Promise<boolean> {
  try {
    const mainBot = new Bot(config.MAIN_BOT_TOKEN);
    
    const displayName = subscriberInfo.username 
      ? `@${subscriberInfo.username}` 
      : subscriberInfo.firstName || `User ${subscriberInfo.telegramUserId}`;

    const message = new MessageBuilder()
      .header('🔔', 'New Subscriber')
      .break()
      .field('Bot', botName)
      .field('Subscriber', displayName)
      .break()
      .line('A new user has started your bot!')
      .toString();

    const success = await safeSendMessage(
      mainBot,
      clientTelegramId,
      message,
      { parse_mode: 'HTML' }
    );

    if (success) {
      logger.info({ 
        clientTelegramId, 
        subscriberUserId: subscriberInfo.telegramUserId,
        botName 
      }, 'Client notified of new subscriber');
    } else {
      logger.warn({ 
        clientTelegramId, 
        subscriberUserId: subscriberInfo.telegramUserId 
      }, 'Failed to notify client of new subscriber');
    }

    return success;
  } catch (error) {
    logger.error({ 
      error, 
      clientTelegramId, 
      subscriberUserId: subscriberInfo.telegramUserId 
    }, 'Error notifying client of new subscriber');
    return false;
  }
}
