/**
 * Selling Bot Start Handler
 * Shows welcome message and main menu
 */

import { Bot, InlineKeyboard } from 'grammy';
import type { SellingBotContext } from '../../../shared/types/index.js';
import { withFooter, formatDate, daysUntil, escapeHtml, MessageBuilder } from '../../../shared/utils/index.js';

export function setupStartHandler(bot: Bot<SellingBotContext>) {
  bot.command('start', async (ctx) => {
    await showWelcome(ctx);
  });

  bot.callbackQuery('start', async (ctx) => {
    await ctx.answerCallbackQuery();
    await showWelcome(ctx);
  });
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
