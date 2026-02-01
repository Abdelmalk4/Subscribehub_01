/**
 * Subscription Plans Handler (Supabase version)
 */

import { Bot, InlineKeyboard } from 'grammy';
import type { SellingBotContext } from '../../../shared/types/index.js';
import { supabase, type SubscriptionPlan } from '../../../database/index.js';
import { withFooter, formatPlanButton, formatDuration, formatPrice, escapeHtml } from '../../../shared/utils/index.js';
import { sellingBotLogger as logger } from '../../../shared/utils/index.js';

export function setupPlansHandler(bot: Bot<SellingBotContext>) {
  bot.command('plans', async (ctx) => {
    await showPlans(ctx);
  });

  bot.callbackQuery('plans', async (ctx) => {
    await ctx.answerCallbackQuery();
    await showPlans(ctx);
  });

  bot.callbackQuery(/^select_plan:(.+)$/, async (ctx) => {
    const planId = ctx.match[1];
    await ctx.answerCallbackQuery();
    await selectPlan(ctx, planId);
  });
}

async function showPlans(ctx: SellingBotContext) {
  const botConfig = ctx.botConfig!;

  try {
    const { data } = await supabase
      .from('subscription_plans')
      .select('*')
      .eq('bot_id', botConfig.id)
      .eq('plan_type', 'CLIENT')
      .eq('is_active', true)
      .order('price_amount', { ascending: true });

    const plans = data as SubscriptionPlan[] | null;

    if (!plans || plans.length === 0) {
      await ctx.reply(
        withFooter('📋 <b>No Plans Available</b>\n\nThere are currently no subscription plans available.'),
        { parse_mode: 'HTML' }
      );
      return;
    }

    const keyboard = new InlineKeyboard();

    for (const plan of plans) {
      const buttonText = formatPlanButton(plan.name, plan.price_amount, plan.price_currency, plan.duration_days);
      keyboard.text(buttonText, `select_plan:${plan.id}`).row();
    }

    keyboard.text('« Back', 'start');

    let message = '📋 <b>Available Subscription Plans</b>\n\n';
    
    for (const plan of plans) {
      message += `<b>${escapeHtml(plan.name)}</b>\n`;
      message += `💰 ${formatPrice(plan.price_amount, plan.price_currency)} for ${formatDuration(plan.duration_days)}\n`;
      if (plan.description) message += `📝 ${escapeHtml(plan.description)}\n`;
      message += '\n';
    }

    message += 'Select a plan to subscribe:';

    await ctx.reply(withFooter(message), {
      parse_mode: 'HTML',
      reply_markup: keyboard,
    });
  } catch (error) {
    logger.error({ error, botId: botConfig.id }, 'Failed to load plans');
    await ctx.reply('❌ Failed to load plans. Please try again.');
  }
}

async function selectPlan(ctx: SellingBotContext, planId: string) {
  try {
    const { data } = await supabase
      .from('subscription_plans')
      .select('*')
      .eq('id', planId)
      .single();

    const plan = data as SubscriptionPlan | null;

    if (!plan || !plan.is_active) {
      await ctx.reply('❌ This plan is no longer available.');
      return;
    }

    ctx.session.purchase = {
      step: 'plan_selected',
      planId: plan.id,
    };

    const keyboard = new InlineKeyboard()
      .text('💳 Pay Now', `create_invoice:${plan.id}`)
      .row()
      .text('« Back to Plans', 'plans');

    const message = `
📋 <b>Plan Selected</b>

<b>${escapeHtml(plan.name)}</b>
💰 ${formatPrice(plan.price_amount, plan.price_currency)}
📅 Duration: ${formatDuration(plan.duration_days)}
${plan.description ? `📝 ${escapeHtml(plan.description)}\n` : ''}
Click "Pay Now" to generate a payment invoice.
`;

    await ctx.reply(withFooter(message), {
      parse_mode: 'HTML',
      reply_markup: keyboard,
    });
  } catch (error) {
    logger.error({ error, planId }, 'Failed to select plan');
    await ctx.reply('❌ Failed to process selection. Please try again.');
  }
}
