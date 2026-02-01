/**
 * Client Settings Handler - Complete Implementation
 */

import { Bot, InlineKeyboard } from 'grammy';
import type { MainBotContext } from '../../../shared/types/index.js';
import { supabase, type Client } from '../../../database/index.js';
import { withFooter, escapeHtml, MessageBuilder } from '../../../shared/utils/index.js';
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
    const message = new MessageBuilder()
      .header('✏️', 'Edit Business Name')
      .break()
      .line('Send your new business name:')
      .break()
      .info(`Current: ${ctx.client?.businessName || ''}`)
      .break()
      .line('Or send /cancel to go back.')
      .toString();

    await ctx.reply(message, { parse_mode: 'HTML' });
  });

  // Edit Email - prompt
  bot.callbackQuery('edit_email', clientOnly(), async (ctx) => {
    await ctx.answerCallbackQuery();
    (ctx.session as any).editingField = 'email';
    const message = new MessageBuilder()
      .header('📧', 'Edit Contact Email')
      .break()
      .line('Send your new email address:')
      .break()
      .line('Or send /cancel to go back.')
      .toString();

    await ctx.reply(message, { parse_mode: 'HTML' });
  });

  // Notification settings
  bot.callbackQuery('notification_settings', clientOnly(), async (ctx) => {
    await ctx.answerCallbackQuery();
    const keyboard = new InlineKeyboard()
      .text('🔔 Enable All', 'notif_enable_all')
      .text('🔕 Disable All', 'notif_disable_all')
      .row()
      .text('« Back to Settings', 'settings');

    const message = new MessageBuilder()
      .header('🔔', 'Notification Settings')
      .break()
      .line('Configure when you receive notifications:')
      .break()
      .list([
        '<b>New Subscribers</b> - When someone subscribes',
        '<b>Payments</b> - When payments are confirmed',
        '<b>Expirations</b> - When subscriptions expire'
      ])
      .break()
      .info('Feature coming soon!')
      .toString();

    await ctx.reply(message, { parse_mode: 'HTML', reply_markup: keyboard });
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
        await ctx.reply(`✅ Business name updated to: <b>${escapeHtml(text)}</b>`, { parse_mode: 'HTML' });
        
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
        await ctx.reply(`✅ Email updated to: <b>${escapeHtml(text)}</b>`, { parse_mode: 'HTML' });
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

  const message = new MessageBuilder()
    .header('⚙️', 'Account Settings')
    .break()
    .field('Business Name', freshClient?.business_name || client.businessName)
    .field('Email', freshClient?.contact_email || 'Not set')
    .field('Username', freshClient?.username ? `@${freshClient.username}` : 'Not set')
    .field('Status', freshClient?.status || client.status)
    .break()
    .line('Select an option to edit:')
    .toString();

  await ctx.reply(message, {
    parse_mode: 'HTML',
    reply_markup: keyboard,
  });
}
