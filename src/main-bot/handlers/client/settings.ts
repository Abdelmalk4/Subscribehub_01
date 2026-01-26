/**
 * Client Settings Handler
 */

import { Bot, InlineKeyboard } from 'grammy';
import type { MainBotContext } from '../../../shared/types/index.js';
import { supabase, type Client } from '../../../database/index.js';
import { withFooter } from '../../../shared/utils/index.js';
import { mainBotLogger as logger } from '../../../shared/utils/index.js';
import { clientOnly } from '../../middleware/client.js';

export function setupSettingsHandler(bot: Bot<MainBotContext>) {
  bot.callbackQuery('settings', clientOnly(), async (ctx) => {
    await ctx.answerCallbackQuery();
    await showSettings(ctx);
  });

  bot.callbackQuery('edit_business_name', clientOnly(), async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(withFooter(`
✏️ *Edit Business Name*

Send your new business name:

_Current: ${ctx.client?.businessName}_
    `), { parse_mode: 'Markdown' });
  });

  bot.callbackQuery('edit_email', clientOnly(), async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(withFooter(`
📧 *Edit Contact Email*

Send your new email address, or /skip to remove:

_Used for important notifications about your account._
    `), { parse_mode: 'Markdown' });
  });

  bot.callbackQuery('notification_settings', clientOnly(), async (ctx) => {
    await ctx.answerCallbackQuery();
    const keyboard = new InlineKeyboard()
      .text('🔔 Enable All', 'notif_enable_all')
      .text('🔕 Disable All', 'notif_disable_all')
      .row()
      .text('« Back to Settings', 'settings');

    await ctx.reply(withFooter(`
🔔 *Notification Settings*

Configure when you receive notifications:

• *New Subscribers* - When someone subscribes
• *Payments* - When payments are confirmed
• *Expirations* - When subscriptions expire

_Feature coming soon!_
    `), { parse_mode: 'Markdown', reply_markup: keyboard });
  });
}

async function showSettings(ctx: MainBotContext) {
  const client = ctx.client!;

  const keyboard = new InlineKeyboard()
    .text('✏️ Edit Business Name', 'edit_business_name')
    .row()
    .text('📧 Edit Email', 'edit_email')
    .row()
    .text('🔔 Notifications', 'notification_settings')
    .row()
    .text('« Back', 'start');

  await ctx.reply(withFooter(`
⚙️ *Account Settings*

*Business Name:* ${client.businessName}
*Username:* ${client.username ? `@${client.username}` : 'Not set'}
*Status:* ${client.status}

Select an option to edit:
  `), {
    parse_mode: 'Markdown',
    reply_markup: keyboard,
  });
}
