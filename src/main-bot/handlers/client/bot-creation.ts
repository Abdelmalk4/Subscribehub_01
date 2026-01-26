/**
 * Bot Creation Conversation (Supabase version)
 * Handles creating a new Selling Bot for a client
 */

import { InlineKeyboard, Bot } from 'grammy';
import type { MainBotConversation, MainBotContext } from '../../../shared/types/index.js';
import { supabase, type SellingBot } from '../../../database/index.js';
import { mainBotLogger as logger, addDays, withFooter } from '../../../shared/utils/index.js';
import { PLATFORM } from '../../../shared/config/index.js';

export async function botCreationConversation(
  conversation: MainBotConversation,
  ctx: MainBotContext
) {
  const client = ctx.client;
  if (!client) {
    await ctx.reply('❌ You must be registered to create a bot.');
    return;
  }

  // Step 1: Get Bot Token
  await ctx.reply(
    '🤖 *Step 1/4: Bot Token*\n\n' +
    'First, create a new bot using @BotFather:\n\n' +
    '1. Open @BotFather\n' +
    '2. Send /newbot\n' +
    '3. Follow the instructions\n' +
    '4. Copy the API token and paste it here\n\n' +
    '_The token looks like: 123456789:ABCdefGHIjklMNOpqrsTUVwxyz_',
    { parse_mode: 'Markdown' }
  );

  const tokenCtx = await conversation.waitFor('message:text');
  const botToken = tokenCtx.message.text.trim();

  if (!/^\d+:[A-Za-z0-9_-]{35,}$/.test(botToken)) {
    await ctx.reply('❌ Invalid bot token format. Please check and try again with /createbot');
    return;
  }

  // Validate token by calling Telegram API
  let botUsername: string;
  let botName: string;
  try {
    const testBot = new Bot(botToken);
    const botInfo = await testBot.api.getMe();
    botUsername = botInfo.username!;
    botName = botInfo.first_name;
    await ctx.reply(`✅ Bot verified: @${botUsername}`);
  } catch {
    await ctx.reply('❌ Could not connect to bot. Make sure the token is correct.');
    return;
  }

  // Check if bot already exists
  const { data: existingBot } = await supabase
    .from('selling_bots')
    .select('id')
    .eq('bot_token', botToken)
    .single();

  if (existingBot) {
    await ctx.reply('❌ This bot is already registered on the platform.');
    return;
  }

  // Step 2: NOWPayments API Key
  await ctx.reply(
    '💳 *Step 2/4: NOWPayments API Key*\n\n' +
    'Enter your NOWPayments API key:\n\n' +
    '1. Go to nowpayments.io\n' +
    '2. Create an account or log in\n' +
    '3. Navigate to API Keys\n' +
    '4. Create a new API key\n' +
    '5. Paste it here',
    { parse_mode: 'Markdown' }
  );

  const apiKeyCtx = await conversation.waitFor('message:text');
  const nowpaymentsApiKey = apiKeyCtx.message.text.trim();

  if (nowpaymentsApiKey.length < 20) {
    await ctx.reply('❌ Invalid API key format. Please try again.');
    return;
  }

  // Step 3: Wallet Address
  await ctx.reply(
    '💰 *Step 3/4: Crypto Wallet Address*\n\n' +
    'Enter your crypto wallet address where payments will be sent:\n\n' +
    '_This is your NOWPayments payout wallet._',
    { parse_mode: 'Markdown' }
  );

  const walletCtx = await conversation.waitFor('message:text');
  const cryptoWalletAddress = walletCtx.message.text.trim();

  // Step 4: Confirmation
  const keyboard = new InlineKeyboard()
    .text('✅ Create Bot', 'confirm_bot_creation')
    .row()
    .text('❌ Cancel', 'cancel_bot_creation');

  await ctx.reply(
    '📋 *Step 4/4: Confirm Bot Creation*\n\n' +
    `*Bot:* @${botUsername}\n` +
    `*Name:* ${botName}\n` +
    `*Wallet:* ${cryptoWalletAddress.slice(0, 10)}...${cryptoWalletAddress.slice(-6)}\n\n` +
    'Create this Selling Bot?',
    {
      parse_mode: 'Markdown',
      reply_markup: keyboard,
    }
  );

  const confirmCtx = await conversation.waitForCallbackQuery([
    'confirm_bot_creation',
    'cancel_bot_creation',
  ]);

  if (confirmCtx.callbackQuery.data === 'cancel_bot_creation') {
    await confirmCtx.answerCallbackQuery('Cancelled');
    await ctx.reply('❌ Bot creation cancelled.');
    return;
  }

  await confirmCtx.answerCallbackQuery('Creating bot...');

  // Create bot in database
  try {
    const { data: botData, error } = await (supabase
      .from('selling_bots') as any)
      .insert({
        client_id: client.id,
        bot_token: botToken,
        bot_username: botUsername,
        bot_name: botName,
        nowpayments_api_key: nowpaymentsApiKey,
        crypto_wallet_address: cryptoWalletAddress,
        status: 'ACTIVE',
      })
      .select()
      .single();

    if (error) throw error;

    const bot = botData as SellingBot;

    // Activate trial if this is the first bot
    if (!client.trialActivated) {
      const trialEnd = addDays(new Date(), PLATFORM.TRIAL_DAYS);

      await (supabase
        .from('clients') as any)
        .update({
          status: 'TRIAL',
          trial_activated: true,
          trial_start_date: new Date().toISOString(),
          trial_end_date: trialEnd.toISOString(),
        })
        .eq('id', client.id);

      await ctx.reply(
        withFooter(
          '🎉 *Selling Bot Created!*\n\n' +
          `Your bot @${botUsername} is now active!\n\n` +
          `🆓 *Your ${PLATFORM.TRIAL_DAYS}-day free trial has started!*\n\n` +
          '*Next steps:*\n' +
          '1. Add your bot as admin to your channel\n' +
          '2. Create subscription plans\n' +
          '3. Share your bot link with subscribers\n\n' +
          'Use /mybots to manage your bots.'
        ),
        { parse_mode: 'Markdown' }
      );
    } else {
      await ctx.reply(
        withFooter(
          '🎉 *Selling Bot Created!*\n\n' +
          `Your bot @${botUsername} is now active!\n\n` +
          '*Next steps:*\n' +
          '1. Add your bot as admin to your channel\n' +
          '2. Create subscription plans\n' +
          '3. Share your bot link'
        ),
        { parse_mode: 'Markdown' }
      );
    }

    logger.info({ botId: bot.id, clientId: client.id, botUsername }, 'Selling bot created');
  } catch (error) {
    logger.error({ error, clientId: client.id }, 'Failed to create selling bot');
    await ctx.reply('❌ Failed to create bot. Please try again later.');
  }
}
