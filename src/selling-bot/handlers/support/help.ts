/**
 * Help Handler
 * Shows help and support options
 */

import { Bot, InlineKeyboard } from 'grammy';
import type { SellingBotContext } from '../../../shared/types/index.js';
import { withFooter, escapeHtml } from '../../../shared/utils/index.js';

export function setupHelpHandler(bot: Bot<SellingBotContext>) {
  bot.command('help', async (ctx) => {
    await showHelp(ctx);
  });

  bot.callbackQuery('help', async (ctx) => {
    await ctx.answerCallbackQuery();
    await showHelp(ctx);
  });
}

async function showHelp(ctx: SellingBotContext) {
  const botConfig = ctx.botConfig;
  const channelUsername = botConfig?.linkedChannelUsername;

  const keyboard = new InlineKeyboard()
    .text('📋 View Plans', 'plans')
    .text('📊 My Status', 'my_subscription')
    .row()
    .text('« Back to Menu', 'start');

  const message = `
❓ <b>Help & Support</b>

<b>Common Commands:</b>
/start - Main menu
/plans - View subscription plans
/status - Check your subscription
/help - This help message

<b>Payment Issues:</b>
• Payments are processed via NOWPayments
• Confirmations usually take 1-10 minutes
• Make sure to send the exact amount

<b>Need more help?</b>
${channelUsername ? `Contact: @${escapeHtml(channelUsername)}` : 'Contact the channel owner'}
`;

  await ctx.reply(withFooter(message), {
    parse_mode: 'HTML',
    reply_markup: keyboard,
  });
}
