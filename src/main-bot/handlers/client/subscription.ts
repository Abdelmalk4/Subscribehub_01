/**
 * Subscription Handler (Supabase version)
 * Client platform subscription management
 */

import { Bot, InlineKeyboard } from 'grammy';
import type { MainBotContext } from '../../../shared/types/index.js';
import { supabase, type Client, type SubscriptionPlan } from '../../../database/index.js';
import { createInvoice } from '../../../shared/integrations/nowpayments.js';
import { config, PLATFORM } from '../../../shared/config/index.js';
import { withFooter, formatDate, formatPrice, formatDuration, daysUntil, addDays, MessageBuilder } from '../../../shared/utils/index.js';
import { mainBotLogger as logger } from '../../../shared/utils/index.js';
import { clientOnly } from '../../middleware/client.js';

export function setupSubscriptionHandler(bot: Bot<MainBotContext>) {
  // View subscription status
  bot.callbackQuery('subscription', clientOnly(), async (ctx) => {
    await ctx.answerCallbackQuery();
    await showSubscriptionStatus(ctx);
  });

  bot.command('subscription', clientOnly(), async (ctx) => {
    await showSubscriptionStatus(ctx);
  });

  // View platform plans
  bot.callbackQuery('platform_plans', clientOnly(), async (ctx) => {
    await ctx.answerCallbackQuery();
    await showPlatformPlans(ctx);
  });

  // Select platform plan
  bot.callbackQuery(/^select_platform_plan:(.+)$/, clientOnly(), async (ctx) => {
    const planId = ctx.match[1];
    await ctx.answerCallbackQuery('Generating invoice...');
    await createPlatformInvoice(ctx, planId);
  });
}

async function showSubscriptionStatus(ctx: MainBotContext) {
  const client = ctx.client!;

  const { data, error } = await supabase
    .from('clients')
    .select('*, subscription_plans(*)')
    .eq('id', client.id)
    .single();

  const fullClient = data as (Client & { subscription_plans: SubscriptionPlan | null }) | null;

  if (error || !fullClient) return;

  const keyboard = new InlineKeyboard();

  if (fullClient.status === 'TRIAL') {
    const daysLeft = fullClient.trial_end_date ? daysUntil(new Date(fullClient.trial_end_date)) : 0;

    keyboard.text('🚀 Upgrade Now', 'platform_plans').row();
    keyboard.text('« Back', 'start');

    const message = new MessageBuilder()
      .header('💳', 'Your Subscription')
      .break()
      .field('Status', '🆓 Free Trial')
      .field('Days Remaining', daysLeft.toString())
      .field('Trial Ends', fullClient.trial_end_date ? formatDate(new Date(fullClient.trial_end_date)) : 'N/A')
      .break()
      .line('Upgrade now to ensure uninterrupted service!')
      .toString();

    await ctx.reply(message, {
      parse_mode: 'HTML',
      reply_markup: keyboard,
    });
  } else if (fullClient.status === 'ACTIVE') {
    const plan = fullClient.subscription_plans;
    const daysLeft = fullClient.platform_subscription_end
      ? daysUntil(new Date(fullClient.platform_subscription_end))
      : 0;

    keyboard.text('🔄 Renew', 'platform_plans');
    keyboard.text('📋 Change Plan', 'platform_plans').row();
    keyboard.text('« Back', 'start');

    const message = new MessageBuilder()
      .header('💳', 'Your Subscription')
      .break()
      .field('Status', '✅ Active')
      .field('Plan', plan?.name || 'Unknown')
      .field('Renews', fullClient.platform_subscription_end ? formatDate(new Date(fullClient.platform_subscription_end)) : 'N/A')
      .field('Days Left', daysLeft.toString())
      .break();

    if (plan) {
      message
        .header('📝', 'Plan Limits')
        .list([
          `Max Bots: ${plan.max_bots || 'Unlimited'}`,
          `Max Subscribers/Bot: ${plan.max_subscribers || 'Unlimited'}`
        ]);
    }

    await ctx.reply(message.toString(), {
      parse_mode: 'HTML',
      reply_markup: keyboard,
    });
  } else if (fullClient.status === 'EXPIRED') {
    keyboard.text('🚀 Reactivate Now', 'platform_plans').row();
    keyboard.text('« Back', 'start');

    const message = new MessageBuilder()
      .header('💳', 'Your Subscription')
      .break()
      .field('Status', '⚠️ Expired')
      .break()
      .line('Your subscription has expired. Your selling bots are paused.')
      .break()
      .line('Reactivate now to resume service!')
      .toString();

    await ctx.reply(message, {
      parse_mode: 'HTML',
      reply_markup: keyboard,
    });
  } else {
    keyboard.text('« Back', 'start');
    const message = new MessageBuilder()
      .header('💳', 'Your Subscription')
      .break()
      .field('Status', fullClient.status)
      .toString();

    await ctx.reply(message, { parse_mode: 'HTML', reply_markup: keyboard });
  }
}

async function showPlatformPlans(ctx: MainBotContext) {
  const { data, error } = await supabase
    .from('subscription_plans')
    .select('*')
    .eq('plan_type', 'PLATFORM')
    .eq('is_active', true)
    .order('price_amount', { ascending: true });

  const plans = data as SubscriptionPlan[] | null;

  if (error || !plans || plans.length === 0) {
    await ctx.reply(withFooter('❌ No subscription plans available. Contact support.'));
    return;
  }

  const keyboard = new InlineKeyboard();

  const mb = new MessageBuilder()
    .header('📋', 'Platform Subscription Plans')
    .break();

  for (const plan of plans) {
    mb.header('🔹', plan.name)
      .line(`💰 ${formatPrice(Number(plan.price_amount), plan.price_currency)} / ${formatDuration(plan.duration_days)}`);
    
    if (plan.max_bots) mb.list([`max ${plan.max_bots} bots`], '🤖');
    if (plan.max_subscribers) mb.list([`max ${plan.max_subscribers} subscribers/bot`], '👥');
    if (plan.description) mb.info(plan.description);
    mb.break();

    keyboard.text(
      `${plan.name} - ${formatPrice(Number(plan.price_amount), plan.price_currency)}`,
      `select_platform_plan:${plan.id}`
    ).row();
  }

  keyboard.text('« Back', 'subscription');

  await ctx.reply(mb.toString(), {
    parse_mode: 'HTML',
    reply_markup: keyboard,
  });
}

async function createPlatformInvoice(ctx: MainBotContext, planId: string) {
  const client = ctx.client!;

  if (!config.NOWPAYMENTS_API_KEY) {
    logger.warn('NOWPayments API key not configured for platform');
    await ctx.reply('❌ Payment system is currently unavailable. Please contact support.');
    return;
  }

  try {
    const { data, error } = await supabase
      .from('subscription_plans')
      .select('*')
      .eq('id', planId)
      .single();

    const plan = data as SubscriptionPlan | null;

    if (error || !plan || plan.plan_type !== 'PLATFORM') {
      await ctx.reply('❌ Invalid plan selected.');
      return;
    }

    // Generate unique order ID
    const orderId = `platform_${client.id}_${Date.now()}`;

    // Create NOWPayments invoice
    const invoice = await createInvoice({
      apiKey: config.NOWPAYMENTS_API_KEY,
      priceAmount: Number(plan.price_amount),
      priceCurrency: plan.price_currency,
      orderId,
      orderDescription: `SubscribeHub Platform - ${plan.name}`,
      ipnCallbackUrl: config.NOWPAYMENTS_IPN_CALLBACK_URL || '',
    });

    // Create pending transaction in database
    const { data: transactionData, error: dbError } = await (supabase.from('payment_transactions') as any)
      .insert({
        payment_type: 'PLATFORM_SUBSCRIPTION',
        client_id: client.id,
        plan_id: plan.id,
        nowpayments_invoice_id: String(invoice.id),
        amount: plan.price_amount,
        currency: plan.price_currency,
        payment_status: 'PENDING',
        expires_at: new Date(Date.now() + PLATFORM.INVOICE_EXPIRATION_MINUTES * 60 * 1000).toISOString(),
      })
      .select()
      .single();

    if (dbError) throw dbError;
    const transaction = transactionData as any;

    const keyboard = new InlineKeyboard()
      .url('🌐 Pay with Crypto', invoice.invoice_url)
      .row()
      .text('« Back to Plans', 'platform_plans');

    const message = new MessageBuilder()
      .header('💳', `Payment for ${plan.name}`)
      .break()
      .field('Amount', formatPrice(Number(plan.price_amount), plan.price_currency))
      .field('Duration', formatDuration(plan.duration_days))
      .break()
      .line('Click the button below to pay securely via NOWPayments.')
      .line('You will be redirected to a hosted checkout page.')
      .break()
      .info(`Invoice expires in ${PLATFORM.INVOICE_EXPIRATION_MINUTES} minutes.`)
      .toString();

    await ctx.reply(message, {
      parse_mode: 'HTML',
      reply_markup: keyboard,
    });

    logger.info({ clientId: client.id, planId, transactionId: transaction.id }, 'Platform invoice created');
  } catch (error) {
    logger.error({ error, planId }, 'Failed to create platform invoice');
    await ctx.reply('❌ Failed to generate payment invoice. Please try again.');
  }
}
