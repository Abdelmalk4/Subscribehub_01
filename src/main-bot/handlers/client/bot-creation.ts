/**
 * Bot Creation Conversation (Supabase version)
 * Handles creating a new Selling Bot for a client
 */

import { InlineKeyboard, Bot } from 'grammy';
import type { MainBotConversation, MainBotContext } from '../../../shared/types/index.js';
import { supabase, type SellingBot } from '../../../database/index.js';
import { mainBotLogger as logger, addDays, withFooter, encrypt, escapeHtml } from '../../../shared/utils/index.js';
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

  // Enforce max_bots limit from client's subscription plan
  if (client.subscriptionPlanId) {
    const { data: plan } = await supabase
      .from('subscription_plans')
      .select('max_bots')
      .eq('id', client.subscriptionPlanId)
      .single();
    
    const maxBots = (plan as { max_bots: number | null } | null)?.max_bots;
    
    if (maxBots) {
      const { count: currentBotCount } = await supabase
        .from('selling_bots')
        .select('*', { count: 'exact', head: true })
        .eq('client_id', client.id);

      if (currentBotCount !== null && currentBotCount >= maxBots) {
        await ctx.reply(
          `❌ <b>Bot Limit Reached</b>\n\n` +
          `Your plan allows a maximum of ${maxBots} bots.\n` +
          `You currently have ${currentBotCount} bots.\n\n` +
          `Upgrade your plan to create more bots.`,
          { parse_mode: 'HTML' }
        );
        return;
      }
    }
  }

  // Step 1: Get Bot Token
  await ctx.reply(
    '🤖 <b>Step 1/4: Bot Token</b>\n\n' +
    'First, create a new bot using @BotFather:\n\n' +
    '1. Open @BotFather\n' +
    '2. Send /newbot\n' +
    '3. Follow the instructions\n' +
    '4. Copy the API token and paste it here\n\n' +
    '<i>The token looks like: 123456789:ABCdefGHIjklMNOpqrsTUVwxyz</i>',
    { parse_mode: 'HTML' }
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

  // Check if bot already exists (using username since token is stored encrypted)
  const { data: existingBot } = await supabase
    .from('selling_bots')
    .select('id')
    .eq('bot_username', botUsername)
    .single();

  if (existingBot) {
    await ctx.reply('❌ This bot is already registered on the platform.');
    return;
  }


  // Step 2: NOWPayments API Key
  await ctx.reply(
    '💳 <b>Step 2/4: NOWPayments API Key</b>\n\n' +
    'Enter your NOWPayments API key:\n\n' +
    '1. Go to nowpayments.io\n' +
    '2. Create an account or log in\n' +
    '3. Navigate to API Keys\n' +
    '4. Create a new API key\n' +
    '5. Paste it here',
    { parse_mode: 'HTML' }
  );

  const apiKeyCtx = await conversation.waitFor('message:text');
  const nowpaymentsApiKey = apiKeyCtx.message.text.trim();

  if (nowpaymentsApiKey.length < 20) {
    await ctx.reply('❌ Invalid API key format. Please try again.');
    return;
  }

  // Step 3: Wallet Address
  await ctx.reply(
    '💰 <b>Step 3/4: Crypto Wallet Address</b>\n\n' +
    'Enter your crypto wallet address where payments will be sent:\n\n' +
    '<i>This is your NOWPayments payout wallet.</i>',
    { parse_mode: 'HTML' }
  );

  const walletCtx = await conversation.waitFor('message:text');
  const cryptoWalletAddress = walletCtx.message.text.trim();

  // Basic wallet validation
  if (cryptoWalletAddress.length < 20 || cryptoWalletAddress.length > 100) {
    await ctx.reply('❌ Invalid wallet address. Address should be between 20-100 characters.');
    return;
  }

  // Common wallet format patterns
  const walletPatterns = [
    /^0x[a-fA-F0-9]{40}$/, // ETH/ERC20
    /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/, // Bitcoin legacy
    /^bc1[a-zA-HJ-NP-Z0-9]{25,87}$/, // Bitcoin bech32
    /^T[A-Za-z1-9]{33}$/, // TRON
    /^[LM][a-km-zA-HJ-NP-Z1-9]{26,33}$/, // Litecoin
  ];

  const isRecognizedFormat = walletPatterns.some(pattern => pattern.test(cryptoWalletAddress));
  if (!isRecognizedFormat) {
    await ctx.reply('⚠️ Wallet format not recognized. Proceeding anyway - NOWPayments will validate during payout.');
    // Continue - NOWPayments will ultimately validate
  }

  // Step 4: Confirmation
  const keyboard = new InlineKeyboard()
    .text('✅ Create Bot', 'confirm_bot_creation')
    .row()
    .text('❌ Cancel', 'cancel_bot_creation');

  await ctx.reply(
    '📋 <b>Step 4/4: Confirm Bot Creation</b>\n\n' +
    `<b>Bot:</b> @${escapeHtml(botUsername)}\n` +
    `<b>Name:</b> ${escapeHtml(botName)}\n` +
    `<b>Wallet:</b> ${cryptoWalletAddress.slice(0, 10)}...${cryptoWalletAddress.slice(-6)}\n\n` +
    'Create this Selling Bot?',
    {
      parse_mode: 'HTML',
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
        bot_token: encrypt(botToken), // Encrypt token
        bot_username: botUsername,
        bot_name: botName,
        nowpayments_api_key: encrypt(nowpaymentsApiKey), // Encrypt API key
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
          '🎉 <b>Selling Bot Created!</b>\n\n' +
          `Your bot @${escapeHtml(botUsername)} is now active!\n\n` +
          `🆓 <b>Your ${PLATFORM.TRIAL_DAYS}-day free trial has started!</b>\n\n` +
          '<b>Next steps:</b>\n' +
          '1. Add your bot as admin to your channel\n' +
          '2. Create subscription plans\n' +
          '3. Share your bot link with subscribers\n\n' +
          'Use /mybots to manage your bots.'
        ),
        { parse_mode: 'HTML' }
      );
    } else {
      await ctx.reply(
        withFooter(
          '🎉 <b>Selling Bot Created!</b>\n\n' +
          `Your bot @${escapeHtml(botUsername)} is now active!\n\n` +
          '<b>Next steps:</b>\n' +
          '1. Add your bot as admin to your channel\n' +
          '2. Create subscription plans\n' +
          '3. Share your bot link'
        ),
        { parse_mode: 'HTML' }
      );
    }

    logger.info({ botId: bot.id, clientId: client.id, botUsername }, 'Selling bot created');
  } catch (error) {
    logger.error({ error, clientId: client.id }, 'Failed to create selling bot');
    await ctx.reply('❌ Failed to create bot. Please try again later.');
  }
}
