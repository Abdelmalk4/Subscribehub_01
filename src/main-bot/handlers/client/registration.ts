/**
 * Client Registration Conversation (Supabase version)
 * Handles new client onboarding flow
 */

import { InlineKeyboard } from 'grammy';
import type { MainBotConversation, MainBotContext } from '../../../shared/types/index.js';
import { supabase, type Client } from '../../../database/index.js';
import { mainBotLogger as logger } from '../../../shared/utils/index.js';
import { withFooter } from '../../../shared/utils/format.js';

export async function registrationConversation(
  conversation: MainBotConversation,
  ctx: MainBotContext
) {
  const userId = ctx.from!.id;
  const username = ctx.from!.username;

  // Step 1: Business Name
  await ctx.reply(
    '📝 *Step 1/4: Business Name*\n\n' +
    'What is the name of your business or channel?\n\n' +
    '_Example: "Premium Signals VIP"_',
    { parse_mode: 'Markdown' }
  );

  const businessNameCtx = await conversation.waitFor('message:text');
  const businessName = businessNameCtx.message.text.trim();

  if (businessName.length < 2 || businessName.length > 100) {
    await ctx.reply('❌ Business name must be between 2 and 100 characters. Please try again.');
    return;
  }

  // Step 2: Channel Username
  await ctx.reply(
    '📝 *Step 2/4: Channel Username*\n\n' +
    'What is your Telegram channel username?\n\n' +
    '_Example: @premiumsignals or premiumsignals_',
    { parse_mode: 'Markdown' }
  );

  const channelCtx = await conversation.waitFor('message:text');
  let channelUsername = channelCtx.message.text.trim();
  channelUsername = channelUsername.replace(/^@/, '').replace(/^https?:\/\/t\.me\//, '');

  // Step 3: Email (Optional)
  await ctx.reply(
    '📝 *Step 3/4: Contact Email (Optional)*\n\n' +
    'Enter your email address for important notifications, or send /skip to skip.\n\n' +
    '_Your email will be kept private._',
    { parse_mode: 'Markdown' }
  );

  const emailCtx = await conversation.waitFor('message:text');
  let contactEmail: string | null = null;

  if (emailCtx.message.text !== '/skip') {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (emailRegex.test(emailCtx.message.text.trim())) {
      contactEmail = emailCtx.message.text.trim();
    } else {
      await ctx.reply('⚠️ Invalid email format. Skipping email.');
    }
  }

  // Step 4: Confirmation
  const keyboard = new InlineKeyboard()
    .text('✅ Confirm & Register', 'confirm_registration')
    .row()
    .text('❌ Cancel', 'cancel_registration');

  await ctx.reply(
    '📋 *Step 4/4: Confirm Registration*\n\n' +
    `*Business Name:* ${businessName}\n` +
    `*Channel:* @${channelUsername}\n` +
    `*Email:* ${contactEmail || 'Not provided'}\n\n` +
    'Is this information correct?',
    {
      parse_mode: 'Markdown',
      reply_markup: keyboard,
    }
  );

  const confirmCtx = await conversation.waitForCallbackQuery(['confirm_registration', 'cancel_registration']);

  if (confirmCtx.callbackQuery.data === 'cancel_registration') {
    await confirmCtx.answerCallbackQuery('Registration cancelled');
    await ctx.reply('❌ Registration cancelled. Use /start to try again.');
    return;
  }

  await confirmCtx.answerCallbackQuery('Processing...');

  // Create client in database
  try {
    const { data: clientData, error } = await (supabase
      .from('clients') as any)
      .insert({
        telegram_user_id: userId,
        username: username ?? null,
        business_name: businessName,
        channel_username: channelUsername,
        contact_email: contactEmail,
        status: 'PENDING',
      })
      .select()
      .single();

    if (error) throw error;

    const client = clientData as Client;

    logger.info({ clientId: client.id, userId }, 'New client registered');

    await ctx.reply(
      withFooter(
        '🎉 *Registration Successful!*\n\n' +
        'Your account has been created and is pending approval.\n\n' +
        'You will receive a notification once your account is verified.\n\n' +
        '_This usually takes 1-2 hours during business hours._'
      ),
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    logger.error({ error, userId }, 'Failed to create client');
    await ctx.reply(
      '❌ Registration failed. Please try again later or contact support.'
    );
  }
}
