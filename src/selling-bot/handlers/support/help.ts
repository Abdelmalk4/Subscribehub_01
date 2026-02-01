/**
 * Help Handler
 * Shows help and support options
 */

import { Bot, InlineKeyboard } from 'grammy';
import type { SellingBotContext } from '../../../shared/types/index.js';
import { withFooter, escapeHtml, MessageBuilder } from '../../../shared/utils/index.js';

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

  const message = new MessageBuilder()
    .header('❓', 'Help & Support')
    .break()
    .line('<b>Common Commands:</b>')
    .list([
      '/start - Main menu',
      '/plans - View subscription plans',
      '/status - Check your subscription',
      '/help - This help message'
    ], '')
    .break()
    .line('<b>Payment Issues:</b>')
    .list([
      'Payments are processed via NOWPayments',
      'Confirmations usually take 1-10 minutes',
      'Make sure to send the exact amount'
    ])
    .break()
    .line('<b>Need more help?</b>')
    .line(channelUsername ? `Contact: @${escapeHtml(channelUsername)}` : 'Contact the channel owner')
    .toString();

  await ctx.reply(message, {
    parse_mode: 'HTML',
    reply_markup: keyboard,
  });
}
