/**
 * Help Command Handler
 */

import { Bot, InlineKeyboard } from 'grammy';
import type { MainBotContext } from '../../../shared/types/index.js';
import { PLATFORM } from '../../../shared/config/index.js';
import { withFooter } from '../../../shared/utils/index.js';

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
    await ctx.reply(withFooter(`
📖 *Getting Started Guide*

1️⃣ *Register* - Create your account with /start
2️⃣ *Wait for Approval* - Admin will verify your account
3️⃣ *Create a Bot* - Use "My Bots" → "Create New Bot"
4️⃣ *Configure* - Add your NOWPayments API key and wallet
5️⃣ *Link Channel* - Connect your Telegram channel
6️⃣ *Create Plans* - Set up subscription plans
7️⃣ *Share* - Give subscribers your bot link!
    `), { parse_mode: 'Markdown', reply_markup: keyboard });
  });

  bot.callbackQuery('help_bot_setup', async (ctx) => {
    await ctx.answerCallbackQuery();
    const keyboard = new InlineKeyboard().text('« Back to Help', 'help');
    await ctx.reply(withFooter(`
🤖 *Bot Setup Guide*

*Creating Your Selling Bot:*
1. Go to @BotFather and create a new bot
2. Copy the API token
3. In this bot, go to "My Bots" → "Create New Bot"
4. Paste your token when prompted
5. Add your NOWPayments API key
6. Add your crypto wallet address

*Linking Your Channel:*
1. Add your selling bot as admin to your channel
2. Go to "My Bots" → Select bot → "Link Channel"
3. Select your channel from the list
    `), { parse_mode: 'Markdown', reply_markup: keyboard });
  });

  bot.callbackQuery('help_payments', async (ctx) => {
    await ctx.answerCallbackQuery();
    const keyboard = new InlineKeyboard().text('« Back to Help', 'help');
    await ctx.reply(withFooter(`
💳 *Payments Guide*

*Setting Up NOWPayments:*
1. Create account at nowpayments.io
2. Complete KYC verification
3. Generate an API key
4. Add your payout wallet

*How Payments Work:*
• Subscriber selects a plan in your bot
• Invoice is generated via NOWPayments
• Subscriber pays in crypto
• Access is granted automatically
• You receive funds to your wallet
    `), { parse_mode: 'Markdown', reply_markup: keyboard });
  });

  bot.callbackQuery('help_subscribers', async (ctx) => {
    await ctx.answerCallbackQuery();
    const keyboard = new InlineKeyboard().text('« Back to Help', 'help');
    await ctx.reply(withFooter(`
👥 *Subscriber Management*

*Viewing Subscribers:*
Go to "My Bots" → Select bot → "Subscribers"

*Subscriber Statuses:*
• ✅ Active - Has valid subscription
• ⏳ Pending - Payment not completed
• ❌ Expired - Subscription ended

*Manual Actions:*
• Extend subscription
• Revoke access
• View payment history
    `), { parse_mode: 'Markdown', reply_markup: keyboard });
  });

  bot.callbackQuery('help_settings', async (ctx) => {
    await ctx.answerCallbackQuery();
    const keyboard = new InlineKeyboard().text('« Back to Help', 'help');
    await ctx.reply(withFooter(`
⚙️ *Settings Guide*

*Bot Settings:*
• Welcome message customization
• Channel linking
• Plan management

*Account Settings:*
• Business name
• Contact email
• Notification preferences
    `), { parse_mode: 'Markdown', reply_markup: keyboard });
  });

  bot.callbackQuery('contact_support', async (ctx) => {
    await ctx.answerCallbackQuery();
    const keyboard = new InlineKeyboard().text('« Back to Help', 'help');
    await ctx.reply(withFooter(`
📧 *Contact Support*

For assistance, please contact:

📬 Email: support@teletrade.io
💬 Telegram: @TeleTradeSupport

*When contacting support, please include:*
• Your username
• Bot username (if applicable)
• Description of the issue
• Screenshots if possible
    `), { parse_mode: 'Markdown', reply_markup: keyboard });
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

  const message = `
❓ *Help Center*

Welcome to ${PLATFORM.NAME} Help!

Select a topic below to learn more:

• *Getting Started* - New user guide
• *Bot Setup* - Create and configure selling bots
• *Payments* - NOWPayments and subscriptions
• *Subscribers* - Manage your subscribers
• *Settings* - Platform configuration

Need more help? Contact our support team.
`;

  await ctx.reply(withFooter(message), {
    parse_mode: 'Markdown',
    reply_markup: keyboard,
  });
}
