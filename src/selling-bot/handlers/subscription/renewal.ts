/**
 * Renewal Handler (Supabase version)
 * Handles subscription renewals
 */

import { Bot, InlineKeyboard } from 'grammy';
import type { SellingBotContext } from '../../../shared/types/index.js';
import { supabase, type SubscriptionPlan } from '../../../database/index.js';
import { withFooter, formatDate, formatPrice, daysUntil, MessageBuilder } from '../../../shared/utils/index.js';
import { sellingBotLogger as logger } from '../../../shared/utils/index.js';

export function setupRenewalHandler(bot: Bot<SellingBotContext>) {
  bot.command('renew', async (ctx) => {
    await showRenewalOptions(ctx);
  });

  bot.callbackQuery('renew', async (ctx) => {
    await ctx.answerCallbackQuery();
    await showRenewalOptions(ctx);
  });
}

async function showRenewalOptions(ctx: SellingBotContext) {
  const subscriber = ctx.subscriber;
  const botConfig = ctx.botConfig!;

  if (!subscriber) {
    await ctx.reply('❌ Could not load your subscription.');
    return;
  }

  // Get current subscription info
  const isActive = subscriber.subscriptionStatus === 'ACTIVE';
  
  const { data: currentPlanData } = subscriber.subscriptionPlanId
    ? await supabase
        .from('subscription_plans')
        .select('*')
        .eq('id', subscriber.subscriptionPlanId)
        .single()
    : { data: null };

  const currentPlan = currentPlanData as SubscriptionPlan | null;

  // Get available plans
  const { data: plansData, error } = await supabase
    .from('subscription_plans')
    .select('*')
    .eq('bot_id', botConfig.id)
    .eq('plan_type', 'CLIENT')
    .eq('is_active', true)
    .order('price_amount', { ascending: true });

  const plans = plansData as SubscriptionPlan[] | null;

  if (error || !plans || plans.length === 0) {
    await ctx.reply(withFooter('❌ No renewal plans available.'));
    return;
  }

  const keyboard = new InlineKeyboard();

  for (const plan of plans) {
    const isCurrent = currentPlan?.id === plan.id;
    const label = isCurrent
      ? `✓ ${plan.name} (Current)`
      : `${plan.name} - ${formatPrice(plan.price_amount, plan.price_currency)}`;

    keyboard.text(label, `select_plan:${plan.id}`).row();
  }

  keyboard.text('« Back', 'start');

  const mb = new MessageBuilder()
    .header('🔄', 'Renew Your Subscription')
    .break();

  if (isActive && subscriber.subscriptionEndDate) {
    const daysLeft = daysUntil(new Date(subscriber.subscriptionEndDate));
    mb.field('Current Plan', currentPlan?.name || 'N/A')
      .field('Expires', `${formatDate(new Date(subscriber.subscriptionEndDate))} (${daysLeft} days)`)
      .break()
      .info('Renewing now will add to your current subscription.')
      .break();
  }

  mb.line('Select a plan to renew:');
  const message = mb.toString();

  await ctx.reply(message, {
    parse_mode: 'HTML',
    reply_markup: keyboard,
  });
}
