/**
 * Help Command Handler
 */

import { Bot, InlineKeyboard } from 'grammy';
import type { MainBotContext } from '../../../shared/types/index.js';
import { PLATFORM } from '../../../shared/config/index.js';
import { withFooter, MessageBuilder } from '../../../shared/utils/index.js';

export function setupHelpCommand(bot: Bot<MainBotContext>) {
  bot.command('help', async (ctx) => {
    await showHelp(ctx);
  });

  bot.callbackQuery('help', async (ctx) => {
    await ctx.answerCallbackQuery();
    await showHelp(ctx);
  });

  // Help topic handlers
  bot.callbackQuery('help_getting_started', async (ctx) => {
    await ctx.answerCallbackQuery();
    const keyboard = new InlineKeyboard().text('« Back to Help', 'help');
    const message = new MessageBuilder()
      .header('📖', 'Getting Started Guide')
      .break()
      .list([
        'Register - Create your account with /start',
        'Wait for Approval - Admin will verify your account',
        'Create a Bot - Use "My Bots" → "Create New Bot"',
        'Configure - Add your NOWPayments API key and wallet',
        'Link Channel - Connect your Telegram channel',
        'Create Plans - Set up subscription plans',
        'Share - Give subscribers your bot link!'
      ], '👉')
      .toString();

    await ctx.reply(message, { parse_mode: 'HTML', reply_markup: keyboard });
  });

  bot.callbackQuery('help_bot_setup', async (ctx) => {
    await ctx.answerCallbackQuery();
    const keyboard = new InlineKeyboard().text('« Back to Help', 'help');
    const message = new MessageBuilder()
      .header('🤖', 'Bot Setup Guide')
      .break()
      .line('<b>Creating Your Selling Bot:</b>')
      .list([
        'Go to @BotFather and create a new bot',
        'Copy the API token',
        'In this bot, go to "My Bots" → "Create New Bot"',
        'Paste your token when prompted',
        'Add your NOWPayments API key',
        'Add your crypto wallet address'
      ], '1.')
      .break()
      .line('<b>Linking Your Channel:</b>')
      .list([
        'Add your selling bot as admin to your channel',
        'Go to "My Bots" → Select bot → "Link Channel"',
        'Select your channel from the list'
      ], '1.')
      .toString();

    await ctx.reply(message, { parse_mode: 'HTML', reply_markup: keyboard });
  });

  bot.callbackQuery('help_payments', async (ctx) => {
    await ctx.answerCallbackQuery();
    const keyboard = new InlineKeyboard().text('« Back to Help', 'help');
    const message = new MessageBuilder()
      .header('💳', 'Payments Guide')
      .break()
      .line('<b>Setting Up NOWPayments:</b>')
      .list([
        'Create account at nowpayments.io',
        'Complete KYC verification',
        'Generate an API key',
        'Add your payout wallet'
      ], '1.')
      .break()
      .line('<b>How Payments Work:</b>')
      .list([
        'Subscriber selects a plan in your bot',
        'Invoice is generated via NOWPayments',
        'Subscriber pays in crypto',
        'Access is granted automatically',
        'You receive funds to your wallet'
      ])
      .toString();

    await ctx.reply(message, { parse_mode: 'HTML', reply_markup: keyboard });
  });

  bot.callbackQuery('help_subscribers', async (ctx) => {
    await ctx.answerCallbackQuery();
    const keyboard = new InlineKeyboard().text('« Back to Help', 'help');
    const message = new MessageBuilder()
      .header('👥', 'Subscriber Management')
      .break()
      .line('<b>Viewing Subscribers:</b>')
      .line('Go to "My Bots" → Select bot → "Subscribers"')
      .break()
      .line('<b>Subscriber Statuses:</b>')
      .list([
        '✅ Active - Has valid subscription',
        '⏳ Pending - Payment not completed',
        '❌ Expired - Subscription ended'
      ])
      .break()
      .line('<b>Manual Actions:</b>')
      .list([
        'Extend subscription',
        'Revoke access',
        'View payment history'
      ])
      .toString();

    await ctx.reply(message, { parse_mode: 'HTML', reply_markup: keyboard });
  });

  bot.callbackQuery('help_settings', async (ctx) => {
    await ctx.answerCallbackQuery();
    const keyboard = new InlineKeyboard().text('« Back to Help', 'help');
    const message = new MessageBuilder()
      .header('⚙️', 'Settings Guide')
      .break()
      .line('<b>Bot Settings:</b>')
      .list([
        'Welcome message customization',
        'Channel linking',
        'Plan management'
      ])
      .break()
      .line('<b>Account Settings:</b>')
      .list([
        'Business name',
        'Contact email',
        'Notification preferences'
      ])
      .toString();

    await ctx.reply(message, { parse_mode: 'HTML', reply_markup: keyboard });
  });

  bot.callbackQuery('contact_support', async (ctx) => {
    await ctx.answerCallbackQuery();
    const keyboard = new InlineKeyboard().text('« Back to Help', 'help');
    const message = new MessageBuilder()
      .header('📧', 'Contact Support')
      .break()
      .line('For assistance, please contact:')
      .break()
      .field('📬 Email', 'support@subscribehub.io')
      .field('💬 Telegram', '@SubscribeHubSupport')
      .break()
      .line('<b>When contacting support, please include:</b>')
      .list([
        'Your username',
        'Bot username (if applicable)',
        'Description of the issue',
        'Screenshots if possible'
      ])
      .toString();

    await ctx.reply(message, { parse_mode: 'HTML', reply_markup: keyboard });
  });
}

async function showHelp(ctx: MainBotContext) {
  const keyboard = new InlineKeyboard()
    .text('📖 Getting Started', 'help_getting_started')
    .row()
    .text('🤖 Bot Setup', 'help_bot_setup')
    .text('💳 Payments', 'help_payments')
    .row()
    .text('👥 Subscribers', 'help_subscribers')
    .text('⚙️ Settings', 'help_settings')
    .row()
    .text('📧 Contact Support', 'contact_support')
    .row()
    .text('« Back to Menu', 'start');

  const message = new MessageBuilder()
    .header('❓', 'Help Center')
    .break()
    .line(`Welcome to ${PLATFORM.NAME} Help!`)
    .break()
    .line('Select a topic below to learn more:')
    .break()
    .list([
      '<b>Getting Started</b> - New user guide',
      '<b>Bot Setup</b> - Create and configure selling bots',
      '<b>Payments</b> - NOWPayments and subscriptions',
      '<b>Subscribers</b> - Manage your subscribers',
      '<b>Settings</b> - Platform configuration'
    ])
    .break()
    .info('Need more help? Contact our support team.')
    .toString();

  await ctx.reply(withFooter(message), {
    parse_mode: 'HTML',
    reply_markup: keyboard,
  });
}
