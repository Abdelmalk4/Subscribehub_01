/**
 * Client Settings Handler - Complete Implementation
 */

import { Bot, InlineKeyboard } from 'grammy';
import type { MainBotContext } from '../../../shared/types/index.js';
import { supabase, type Client } from '../../../database/index.js';
import { withFooter } from '../../../shared/utils/index.js';
import { mainBotLogger as logger } from '../../../shared/utils/index.js';
import { clientOnly } from '../../middleware/client.js';

// Extended session type for settings
interface SettingsSession {
  editingField?: 'business_name' | 'email';
}

export function setupSettingsHandler(bot: Bot<MainBotContext>) {
  bot.callbackQuery('settings', clientOnly(), async (ctx) => {
    await ctx.answerCallbackQuery();
    await showSettings(ctx);
  });

  // Edit Business Name - prompt
  bot.callbackQuery('edit_business_name', clientOnly(), async (ctx) => {
    await ctx.answerCallbackQuery();
    (ctx.session as any).editingField = 'business_name';
    await ctx.reply(withFooter(`
✏️ *Edit Business Name*

Send your new business name:

_Current: ${ctx.client?.businessName}_

Or send /cancel to go back.
    `), { parse_mode: 'Markdown' });
  });

  // Edit Email - prompt
  bot.callbackQuery('edit_email', clientOnly(), async (ctx) => {
    await ctx.answerCallbackQuery();
    (ctx.session as any).editingField = 'email';
    await ctx.reply(withFooter(`
📧 *Edit Contact Email*

Send your new email address:

Or send /cancel to go back.
    `), { parse_mode: 'Markdown' });
  });

  // Notification settings
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

  // Handle text input for editing fields
  bot.on('message:text', async (ctx, next) => {
    const session = ctx.session as any;
    const editingField = session.editingField;
    
    if (!editingField || !ctx.client) {
      await next();
      return;
    }

    const text = ctx.message.text.trim();

    if (text === '/cancel') {
      session.editingField = undefined;
      await showSettings(ctx);
      return;
    }

    try {
      if (editingField === 'business_name') {
        if (text.length < 2 || text.length > 100) {
          await ctx.reply('❌ Business name must be 2-100 characters. Please try again or /cancel.');
          return;
        }

        await (supabase.from('clients') as any)
          .update({ business_name: text })
          .eq('id', ctx.client.id);

        session.editingField = undefined;
        await ctx.reply(`✅ Business name updated to: *${text}*`, { parse_mode: 'Markdown' });
        
        // Refresh client data in context
        ctx.client.businessName = text;
        await showSettings(ctx);
      } else if (editingField === 'email') {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(text)) {
          await ctx.reply('❌ Invalid email format. Please try again or /cancel.');
          return;
        }

        await (supabase.from('clients') as any)
          .update({ contact_email: text })
          .eq('id', ctx.client.id);

        session.editingField = undefined;
        await ctx.reply(`✅ Email updated to: *${text}*`, { parse_mode: 'Markdown' });
        await showSettings(ctx);
      }
    } catch (error) {
      logger.error({ error }, 'Failed to update client setting');
      session.editingField = undefined;
      await ctx.reply('❌ Failed to save. Please try again.');
    }
  });
}

async function showSettings(ctx: MainBotContext) {
  const client = ctx.client!;

  // Fetch fresh client data
  const { data } = await supabase
    .from('clients')
    .select('business_name, contact_email, username, status')
    .eq('id', client.id)
    .single();

  const freshClient = data as Pick<Client, 'business_name' | 'contact_email' | 'username' | 'status'> | null;

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

*Business Name:* ${freshClient?.business_name || client.businessName}
*Email:* ${freshClient?.contact_email || 'Not set'}
*Username:* ${freshClient?.username ? `@${freshClient.username}` : 'Not set'}
*Status:* ${freshClient?.status || client.status}

Select an option to edit:
  `), {
    parse_mode: 'Markdown',
    reply_markup: keyboard,
  });
}
