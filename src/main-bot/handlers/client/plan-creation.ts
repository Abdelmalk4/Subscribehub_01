/**
 * Plan Creation Conversation
 */

import { InlineKeyboard } from 'grammy';
import type { MainBotConversation, MainBotContext } from '../../../shared/types/index.js';
import { supabase, type SubscriptionPlan } from '../../../database/index.js';
import { mainBotLogger as logger, withFooter } from '../../../shared/utils/index.js';

export async function planCreationConversation(
  conversation: MainBotConversation,
  ctx: MainBotContext
) {
  const botId = ctx.session.planCreation?.botId;
  if (!botId) {
    await ctx.reply('❌ Error: No bot selected. Please try again from My Bots.');
    return;
  }

  // Step 1: Plan Name
  await ctx.reply(
    '📝 *Step 1/4: Plan Name*\n\n' +
      'Enter a name for this subscription plan:\n\n' +
      '_Example: "Monthly Premium", "VIP Access"_',
    { parse_mode: 'Markdown' }
  );

  const nameCtx = await conversation.waitFor('message:text');
  const name = nameCtx.message.text.trim();

  if (name.length < 2 || name.length > 50) {
    await ctx.reply('❌ Plan name must be 2-50 characters. Please try again.');
    return;
  }

  // Step 2: Price
  await ctx.reply(
    '💰 *Step 2/4: Price*\n\n' +
      'Enter the price in USD:\n\n' +
      '_Example: 9.99, 29, 99.99_',
    { parse_mode: 'Markdown' }
  );

  const priceCtx = await conversation.waitFor('message:text');
  const priceAmount = parseFloat(priceCtx.message.text.trim());

  if (isNaN(priceAmount) || priceAmount <= 0) {
    await ctx.reply('❌ Invalid price. Please enter a number greater than 0.');
    return;
  }

  // Step 3: Duration
  await ctx.reply(
    '📅 *Step 3/4: Duration*\n\n' +
      'Enter the subscription duration in days:\n\n' +
      '_Example: 30 (monthly), 90 (quarterly), 365 (yearly)_',
    { parse_mode: 'Markdown' }
  );

  const durationCtx = await conversation.waitFor('message:text');
  const durationDays = parseInt(durationCtx.message.text.trim());

  if (isNaN(durationDays) || durationDays <= 0) {
    await ctx.reply('❌ Invalid duration. Please enter a number greater than 0.');
    return;
  }

  // Step 4: Description (optional)
  await ctx.reply(
    '📝 *Step 4/4: Description (Optional)*\n\n' +
      'Enter a short description, or send /skip:\n\n' +
      '_Example: "Access to all premium signals"_',
    { parse_mode: 'Markdown' }
  );

  const descCtx = await conversation.waitFor('message:text');
  const description = descCtx.message.text === '/skip' ? null : descCtx.message.text.trim();

  // Confirmation
  const keyboard = new InlineKeyboard()
    .text('✅ Create Plan', 'confirm_plan')
    .row()
    .text('❌ Cancel', 'cancel_plan');

  await ctx.reply(
    `📋 *Confirm Plan Creation*\n\n` +
      `*Name:* ${name}\n` +
      `*Price:* $${priceAmount} USD\n` +
      `*Duration:* ${durationDays} days\n` +
      `*Description:* ${description || 'None'}\n\n` +
      `Create this plan?`,
    {
      parse_mode: 'Markdown',
      reply_markup: keyboard,
    }
  );

  const confirmCtx = await conversation.waitForCallbackQuery([
    'confirm_plan',
    'cancel_plan',
  ]);

  if (confirmCtx.callbackQuery.data === 'cancel_plan') {
    await confirmCtx.answerCallbackQuery('Cancelled');
    await ctx.reply('❌ Plan creation cancelled.');
    return;
  }

  await confirmCtx.answerCallbackQuery('Creating...');

  try {
    const { data, error } = await (supabase.from('subscription_plans') as any)
      .insert({
        bot_id: botId,
        plan_type: 'CLIENT',
        name,
        description,
        duration_days: durationDays,
        price_amount: priceAmount,
        price_currency: 'USD',
        is_active: true,
      })
      .select()
      .single();

    if (error) throw error;

    const plan = data as SubscriptionPlan;

    await ctx.reply(
      withFooter(
        `✅ *Plan Created Successfully!*\n\n` +
          `*${plan.name}* is now available for subscribers.\n\n` +
          `Use "My Bots" → Select bot → "Plans" to manage your plans.`
      ),
      { parse_mode: 'Markdown' }
    );

    logger.info({ planId: plan.id, botId, name }, 'Subscription plan created');
  } catch (error) {
    logger.error({ error, botId }, 'Failed to create plan');
    await ctx.reply('❌ Failed to create plan. Please try again.');
  }
}
