/**
 * Selling Bot Start Handler
 * Shows welcome message and main menu
 */

import { Bot, InlineKeyboard } from 'grammy';
import type { SellingBotContext } from '../../../shared/types/index.js';
import { withFooter, formatDate, daysUntil, escapeHtml, MessageBuilder } from '../../../shared/utils/index.js';
import { supabase } from '../../../database/index.js';
import { notifyClientOfNewSubscriber } from '../../../backend/services/notification/index.js';


export function setupStartHandler(bot: Bot<SellingBotContext>) {
  bot.command('start', async (ctx) => {
    await showWelcome(ctx);
    
    // Notify client of new subscriber (fire-and-forget)
    if (ctx.subscriber && ctx.botConfig) {
      checkAndNotifyNewSubscriber(ctx).catch(() => {
        // Silent fail - don't block user experience
      });
    }
  });

  bot.callbackQuery('start', async (ctx) => {
    await ctx.answerCallbackQuery();
    await showWelcome(ctx);
  });
}

/**
 * Check if subscriber is new and notify client
 */
async function checkAndNotifyNewSubscriber(ctx: SellingBotContext) {
  if (!ctx.subscriber || !ctx.botConfig) return;

  // Check if subscriber has any payment history (indicates returning subscriber)
  const { count } = await supabase
    .from('payment_transactions')
    .select('*', { count: 'exact', head: true })
    .eq('subscriber_id', ctx.subscriber.id);

  // If no payment history, this is a new subscriber
  if (count === 0) {
    // Get client telegram ID
    const { data: botData } = await supabase
      .from('selling_bots')
      .select('client_id, clients(telegram_user_id)')
      .eq('id', ctx.botConfig.id)
      .single();

    if (botData) {
      const clientTelegramId = (botData as any).clients?.telegram_user_id;
      
      if (clientTelegramId) {
        await notifyClientOfNewSubscriber(
          Number(clientTelegramId),
          {
            username: ctx.subscriber.username,
            firstName: ctx.subscriber.firstName,
            telegramUserId: Number(ctx.subscriber.telegramUserId),
          },
          ctx.botConfig.botName || ctx.botConfig.botUsername || 'Your Bot'
        );
      }
    }
  }
}


async function showWelcome(ctx: SellingBotContext) {
  const subscriber = ctx.subscriber;
  const botConfig = ctx.botConfig!;
  const firstName = ctx.from?.first_name || 'there';

  const keyboard = new InlineKeyboard();

  // Build message based on subscription status
  if (subscriber?.subscriptionStatus === 'ACTIVE' && subscriber.subscriptionEndDate) {
    const daysLeft = daysUntil(subscriber.subscriptionEndDate);
    const expiresOn = formatDate(subscriber.subscriptionEndDate);

    keyboard
      .text('📊 My Subscription', 'my_subscription')
      .row()
      .text('🔄 Renew Now', 'plans')
      .row()
      .text('❓ Help', 'help');

    const message = new MessageBuilder()
      .header('👋', `Welcome back, ${firstName}!`)
      .break()
      .field('Subscription Active', '✅')
      .field('Expires', `${expiresOn} (${daysLeft} days left)`)
      .break()
      .line('You have full access to the premium channel.')
      .toString();

    await ctx.reply(message, {
      parse_mode: 'HTML',
      reply_markup: keyboard,
    });
  } else {
    // No active subscription
    keyboard
      .text('📋 View Plans', 'plans')
      .row()
      .text('📊 Check Status', 'my_subscription')
      .row()
      .text('❓ Help', 'help');

    const welcomeText = botConfig.welcomeMessage 
      ? withFooter(escapeHtml(botConfig.welcomeMessage))
      : new MessageBuilder()
        .header('👋', `Welcome, ${firstName}!`)
        .break()
        .line('Get access to premium trading signals and exclusive content.')
        .break()
        .line('Select a subscription plan to get started!')
        .toString();

    // If welcome message exists but doesn't have HTML tags, we just escape it.
    // If we wanted to support simplified markup we'd need a parser, but for now we treat it as text.

    await ctx.reply(
      // If custom welcome message, we help wrap with footer above.
      // If it's our builder result, it already has footer.
      welcomeText, 
      {
        parse_mode: 'HTML',
        reply_markup: keyboard,
      }
    );
  }
}
