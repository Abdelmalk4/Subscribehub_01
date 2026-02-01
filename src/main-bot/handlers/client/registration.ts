/**
 * Client Registration Conversation (Supabase version)
 * Handles new client onboarding flow
 */

import { InlineKeyboard } from 'grammy';
import type { MainBotConversation, MainBotContext } from '../../../shared/types/index.js';
import { supabase, type Client } from '../../../database/index.js';
import { mainBotLogger as logger, MessageBuilder } from '../../../shared/utils/index.js';
import { withFooter, escapeHtml } from '../../../shared/utils/format.js';

export async function registrationConversation(
  conversation: MainBotConversation,
  ctx: MainBotContext
) {
  const userId = ctx.from!.id;
  const username = ctx.from!.username;

  // Step 1: Business Name
  const step1Message = new MessageBuilder()
    .header('📝', 'Step 1/4: Business Name')
    .break()
    .line('What is the name of your business or channel?')
    .break()
    .info('Example: "Premium Signals VIP"')
    .toString();

  await ctx.reply(step1Message, { parse_mode: 'HTML' });

  const businessNameCtx = await conversation.waitFor('message:text');
  const businessName = businessNameCtx.message.text.trim();

  if (businessName.length < 2 || businessName.length > 100) {
    await ctx.reply('❌ Business name must be between 2 and 100 characters. Please try again.');
    return;
  }

  // Step 2: Channel Username
  const step2Message = new MessageBuilder()
    .header('📝', 'Step 2/4: Channel Username')
    .break()
    .line('What is your Telegram channel username?')
    .break()
    .info('Example: @premiumsignals or premiumsignals')
    .toString();

  await ctx.reply(step2Message, { parse_mode: 'HTML' });

  const channelCtx = await conversation.waitFor('message:text');
  let channelUsername = channelCtx.message.text.trim();
  channelUsername = channelUsername.replace(/^@/, '').replace(/^https?:\/\/t\.me\//, '');

  // Step 3: Email (Optional)
  const step3Message = new MessageBuilder()
    .header('📝', 'Step 3/4: Contact Email (Optional)')
    .break()
    .line('Enter your email address for important notifications, or send /skip to skip.')
    .break()
    .info('Your email will be kept private.')
    .toString();

  await ctx.reply(step3Message, { parse_mode: 'HTML' });

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

  const confirmMessage = new MessageBuilder()
    .header('📋', 'Step 4/4: Confirm Registration')
    .break()
    .field('Business Name', businessName)
    .field('Channel', `@${channelUsername}`)
    .field('Email', contactEmail || 'Not provided')
    .break()
    .line('Is this information correct?')
    .toString();

  await ctx.reply(confirmMessage, {
    parse_mode: 'HTML',
    reply_markup: keyboard,
  });

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

    const successMessage = new MessageBuilder()
      .header('🎉', 'Registration Successful!')
      .break()
      .line('Your account has been created and is pending approval.')
      .line('You will receive a notification once your account is verified.')
      .break()
      .info('This usually takes 1-2 hours during business hours.')
      .toString();

    await ctx.reply(successMessage, { parse_mode: 'HTML' });
  } catch (error) {
    logger.error({ error, userId }, 'Failed to create client');
    await ctx.reply(
      '❌ Registration failed. Please try again later or contact support.'
    );
  }
}
