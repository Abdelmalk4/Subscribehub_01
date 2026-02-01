/**
 * Plan Creation Conversation
 */

import { InlineKeyboard } from 'grammy';
import type { MainBotConversation, MainBotContext } from '../../../shared/types/index.js';
import { supabase, type SubscriptionPlan } from '../../../database/index.js';
import { mainBotLogger as logger, withFooter, escapeHtml, MessageBuilder } from '../../../shared/utils/index.js';

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
  const step1Message = new MessageBuilder()
    .header('📝', 'Step 1/4: Plan Name')
    .break()
    .line('Enter a name for this subscription plan:')
    .break()
    .info('Example: "Monthly Premium", "VIP Access"')
    .toString();

  await ctx.reply(step1Message, { parse_mode: 'HTML' });

  const nameCtx = await conversation.waitFor('message:text');
  const name = nameCtx.message.text.trim();

  if (name.length < 2 || name.length > 50) {
    await ctx.reply('❌ Plan name must be 2-50 characters. Please try again.');
    return;
  }

  // Step 2: Price
  const step2Message = new MessageBuilder()
    .header('💰', 'Step 2/4: Price')
    .break()
    .line('Enter the price in USD:')
    .break()
    .info('Example: 9.99, 29, 99.99')
    .toString();

  await ctx.reply(step2Message, { parse_mode: 'HTML' });

  const priceCtx = await conversation.waitFor('message:text');
  const priceAmount = parseFloat(priceCtx.message.text.trim());

  if (isNaN(priceAmount) || priceAmount <= 0) {
    await ctx.reply('❌ Invalid price. Please enter a number greater than 0.');
    return;
  }

  // Step 3: Duration
  const step3Message = new MessageBuilder()
    .header('📅', 'Step 3/4: Duration')
    .break()
    .line('Enter the subscription duration in days:')
    .break()
    .info('Example: 30 (monthly), 90 (quarterly), 365 (yearly)')
    .toString();

  await ctx.reply(step3Message, { parse_mode: 'HTML' });

  const durationCtx = await conversation.waitFor('message:text');
  const durationDays = parseInt(durationCtx.message.text.trim());

  if (isNaN(durationDays) || durationDays <= 0) {
    await ctx.reply('❌ Invalid duration. Please enter a number greater than 0.');
    return;
  }

  // Step 4: Description (optional)
  const step4Message = new MessageBuilder()
    .header('📝', 'Step 4/4: Description (Optional)')
    .break()
    .line('Enter a short description, or send /skip:')
    .break()
    .info('Example: "Access to all premium signals"')
    .toString();

  await ctx.reply(step4Message, { parse_mode: 'HTML' });

  const descCtx = await conversation.waitFor('message:text');
  const description = descCtx.message.text === '/skip' ? null : descCtx.message.text.trim();

  // Confirmation
  const keyboard = new InlineKeyboard()
    .text('✅ Create Plan', 'confirm_plan')
    .row()
    .text('❌ Cancel', 'cancel_plan');

  const confirmMessage = new MessageBuilder()
    .header('📋', 'Confirm Plan Creation')
    .break()
    .field('Name', name)
    .field('Price', `$${priceAmount} USD`)
    .field('Duration', `${durationDays} days`)
    .field('Description', description || 'None')
    .break()
    .line('Create this plan?')
    .toString();

  await ctx.reply(confirmMessage, {
    parse_mode: 'HTML',
    reply_markup: keyboard,
  });

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

    const successMessage = new MessageBuilder()
      .header('✅', 'Plan Created Successfully!')
      .break()
      .line(`<b>${escapeHtml(plan.name)}</b> is now available for subscribers.`)
      .break()
      .line('Use "My Bots" → Select bot → "Plans" to manage your plans.')
      .toString();

    await ctx.reply(successMessage, { parse_mode: 'HTML' });

    logger.info({ planId: plan.id, botId, name }, 'Subscription plan created');
  } catch (error) {
    logger.error({ error, botId }, 'Failed to create plan');
    await ctx.reply('❌ Failed to create plan. Please try again.');
  }
}
