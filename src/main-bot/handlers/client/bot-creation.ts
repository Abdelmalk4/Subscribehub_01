/**
 * Bot Creation Conversation (Supabase version)
 * Handles creating a new Selling Bot for a client
 */

import { InlineKeyboard, Bot } from 'grammy';
import type { MainBotConversation, MainBotContext } from '../../../shared/types/index.js';
import { supabase, type SellingBot } from '../../../database/index.js';
import { mainBotLogger as logger, addDays, withFooter, encrypt, escapeHtml, MessageBuilder } from '../../../shared/utils/index.js';
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
        const message = new MessageBuilder()
          .header('❌', 'Bot Limit Reached')
          .break()
          .line(`Your plan allows a maximum of ${maxBots} bots.`)
          .line(`You currently have ${currentBotCount} bots.`)
          .break()
          .line('Upgrade your plan to create more bots.')
          .toString();

        await ctx.reply(message, { parse_mode: 'HTML' });
        return;
      }
    }
  }

  // Step 1: Get Bot Token
  const step1Message = new MessageBuilder()
    .header('🤖', 'Step 1/4: Bot Token')
    .break()
    .line('First, create a new bot using @BotFather:')
    .break()
    .list([
      'Open @BotFather',
      'Send /newbot',
      'Follow the instructions',
      'Copy the API token and paste it here'
    ], '1.')
    .break()
    .info('The token looks like: 123456789:ABCdefGHIjklMNOpqrsTUVwxyz')
    .toString();

  await ctx.reply(step1Message, { parse_mode: 'HTML' });

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
  const step2Message = new MessageBuilder()
    .header('💳', 'Step 2/4: NOWPayments API Key')
    .break()
    .line('Enter your NOWPayments API key:')
    .break()
    .list([
      'Go to nowpayments.io',
      'Create an account or log in',
      'Navigate to API Keys',
      'Create a new API key',
      'Paste it here'
    ], '1.')
    .toString();

  await ctx.reply(step2Message, { parse_mode: 'HTML' });

  const apiKeyCtx = await conversation.waitFor('message:text');
  const nowpaymentsApiKey = apiKeyCtx.message.text.trim();

  if (nowpaymentsApiKey.length < 20) {
    await ctx.reply('❌ Invalid API key format. Please try again.');
    return;
  }

  // Step 3: Wallet Address
  const step3Message = new MessageBuilder()
    .header('💰', 'Step 3/4: Crypto Wallet Address')
    .break()
    .line('Enter your crypto wallet address where payments will be sent:')
    .break()
    .info('This is your NOWPayments payout wallet.')
    .toString();

  await ctx.reply(step3Message, { parse_mode: 'HTML' });

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

  const step4Message = new MessageBuilder()
    .header('📋', 'Step 4/4: Confirm Bot Creation')
    .break()
    .field('Bot', `@${botUsername}`)
    .field('Name', botName)
    .field('Wallet', `${cryptoWalletAddress.slice(0, 10)}...${cryptoWalletAddress.slice(-6)}`)
    .break()
    .line('Create this Selling Bot?')
    .toString();

  await ctx.reply(step4Message, {
    parse_mode: 'HTML',
    reply_markup: keyboard,
  });

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

      const successMessage = new MessageBuilder()
        .header('🎉', 'Selling Bot Created!')
        .break()
        .line(`Your bot @${escapeHtml(botUsername)} is now active!`)
        .break()
        .line(`🆓 <b>Your ${PLATFORM.TRIAL_DAYS}-day free trial has started!</b>`)
        .break()
        .line('<b>Next steps:</b>')
        .list([
          'Add your bot as admin to your channel',
          'Create subscription plans',
          'Share your bot link with subscribers'
        ], '1.')
        .break()
        .line('Use /mybots to manage your bots.')
        .toString();

      await ctx.reply(successMessage, { parse_mode: 'HTML' });
    } else {
      const successMessage = new MessageBuilder()
        .header('🎉', 'Selling Bot Created!')
        .break()
        .line(`Your bot @${escapeHtml(botUsername)} is now active!`)
        .break()
        .line('<b>Next steps:</b>')
        .list([
          'Add your bot as admin to your channel',
          'Create subscription plans',
          'Share your bot link'
        ], '1.')
        .toString();

      await ctx.reply(successMessage, { parse_mode: 'HTML' });
    }

    logger.info({ botId: bot.id, clientId: client.id, botUsername }, 'Selling bot created');
  } catch (error) {
    logger.error({ error, clientId: client.id }, 'Failed to create selling bot');
    await ctx.reply('❌ Failed to create bot. Please try again later.');
  }
}
