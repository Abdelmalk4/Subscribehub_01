/**
 * Selling Bot Start Handler
 * Shows welcome message and main menu
 */

import { Bot, InlineKeyboard } from 'grammy';
import type { SellingBotContext } from '../../../shared/types/index.js';
import { withFooter, formatDate, daysUntil, escapeHtml } from '../../../shared/utils/index.js';

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

    const message = `
👋 <b>Welcome back, ${escapeHtml(firstName)}!</b>

✅ <b>Subscription Active</b>
📅 Expires: ${expiresOn} (${daysLeft} days left)

You have full access to the premium channel.
`;

    await ctx.reply(withFooter(message), {
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
      ? escapeHtml(botConfig.welcomeMessage)
      : `
👋 <b>Welcome, ${escapeHtml(firstName)}!</b>

Get access to premium trading signals and exclusive content.

Select a subscription plan to get started!
`;

    // If welcome message exists but doesn't have HTML tags, we just escape it.
    // If we wanted to support simplified markup we'd need a parser, but for now we treat it as text.

    await ctx.reply(withFooter(welcomeText), {
      parse_mode: 'HTML',
      reply_markup: keyboard,
    });
  }
}
