/**
 * Start Command Handler
 * Entry point for all Main Bot users
 */

import { Bot, InlineKeyboard } from 'grammy';
import type { MainBotContext } from '../../../shared/types/index.js';
import { PLATFORM } from '../../../shared/config/index.js';
import { withFooter, formatDate, daysUntil } from '../../../shared/utils/index.js';

export function setupStartCommand(bot: Bot<MainBotContext>) {
  bot.command('start', async (ctx) => {
    const user = ctx.from;
    if (!user) return;

    const firstName = user.first_name || 'there';

    // Check if user is a platform admin
    if (ctx.isAdmin) {
      return showAdminDashboard(ctx, firstName);
    }

    // Check if user is already registered
    if (ctx.client) {
      return showClientDashboard(ctx, firstName);
    }

    // New user - show welcome and registration
    return showWelcome(ctx, firstName);
  });

  // Back button handler - used across all menus
  bot.callbackQuery('start', async (ctx) => {
    await ctx.answerCallbackQuery();
    const firstName = ctx.from?.first_name || 'there';

    if (ctx.isAdmin) {
      return showAdminDashboard(ctx, firstName);
    }
    if (ctx.client) {
      return showClientDashboard(ctx, firstName);
    }
    return showWelcome(ctx, firstName);
  });

  // Learn more handler
  bot.callbackQuery('learn_more', async (ctx) => {
    await ctx.answerCallbackQuery();
    const keyboard = new InlineKeyboard()
      .text('🚀 Register Now', 'register')
      .row()
      .text('« Back', 'start');

    await ctx.reply(withFooter(`
📖 *About ${PLATFORM.NAME}*

We help Telegram channel owners monetize their content with automatic subscription management.

*Features:*
• Create white-label subscription bots
• Accept crypto payments via NOWPayments
• Automatic channel access control
• Real-time analytics
• 7-day free trial

Ready to start? Click "Register Now" below!
    `), { parse_mode: 'Markdown', reply_markup: keyboard });
  });
}

async function showWelcome(ctx: MainBotContext, firstName: string) {
  const keyboard = new InlineKeyboard()
    .text('🚀 Register Now', 'register')
    .row()
    .text('📖 Learn More', 'learn_more');

  const message = `
👋 *Welcome to ${PLATFORM.NAME}, ${firstName}!*

Automate your Telegram channel subscriptions with crypto payments.

✨ *What you get:*
• Automated subscriber management
• Crypto payments via NOWPayments
• White-label selling bots
• Real-time analytics
• 7-day free trial

Ready to get started?
`;

  await ctx.reply(withFooter(message), {
    parse_mode: 'Markdown',
    reply_markup: keyboard,
  });
}

async function showClientDashboard(ctx: MainBotContext, firstName: string) {
  const client = ctx.client!;
  const keyboard = new InlineKeyboard();

  // Status-specific actions
  if (client.status === 'PENDING') {
    const message = `
👋 *Welcome back, ${firstName}!*

📋 *Account Status:* ⏳ Pending Approval

Your registration is being reviewed. You'll receive a notification once approved.
`;
    await ctx.reply(withFooter(message), { parse_mode: 'Markdown' });
    return;
  }

  // Build dashboard keyboard
  keyboard
    .text('🤖 My Bots', 'my_bots')
    .text('📊 Analytics', 'analytics')
    .row()
    .text('💳 Subscription', 'subscription')
    .text('⚙️ Settings', 'settings')
    .row()
    .text('❓ Help', 'help');

  // Status message
  let statusLine = '';
  if (client.status === 'TRIAL') {
    const daysLeft = client.trialEndDate ? daysUntil(client.trialEndDate) : 0;
    statusLine = `📋 *Status:* 🆓 Trial (${daysLeft} days left)`;
  } else if (client.status === 'ACTIVE') {
    const renewalDate = client.platformSubscriptionEnd
      ? formatDate(client.platformSubscriptionEnd)
      : 'N/A';
    statusLine = `📋 *Status:* ✅ Active (renews ${renewalDate})`;
  } else if (client.status === 'EXPIRED') {
    statusLine = `📋 *Status:* ⚠️ Expired`;
    keyboard.row().text('🔄 Renew Now', 'renew');
  }

  const message = `
👋 *Welcome back, ${firstName}!*

🏢 *Business:* ${client.businessName}
${statusLine}

What would you like to do?
`;

  await ctx.reply(withFooter(message), {
    parse_mode: 'Markdown',
    reply_markup: keyboard,
  });
}

async function showAdminDashboard(ctx: MainBotContext, firstName: string) {
  const keyboard = new InlineKeyboard()
    .text('👥 All Clients', 'admin_clients')
    .text('📈 Platform Stats', 'admin_stats')
    .row()
    .text('⚙️ Platform Settings', 'admin_settings')
    .text('📋 Pending Approvals', 'admin_pending')
    .row()
    .text('🔍 Search Client', 'admin_search');

  const message = `
🔐 *Admin Dashboard*

Welcome back, ${firstName}!

You have admin access to the ${PLATFORM.NAME} platform.
`;

  await ctx.reply(withFooter(message), {
    parse_mode: 'Markdown',
    reply_markup: keyboard,
  });
}
