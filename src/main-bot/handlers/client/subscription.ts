/**
 * Subscription Handler (Supabase version)
 * Client platform subscription management
 */

import { Bot, InlineKeyboard } from 'grammy';
import type { MainBotContext } from '../../../shared/types/index.js';
import { supabase, type Client, type SubscriptionPlan } from '../../../database/index.js';
import { createInvoice } from '../../../shared/integrations/nowpayments.js';
import { config, PLATFORM } from '../../../shared/config/index.js';
import { withFooter, formatDate, formatPrice, formatDuration, daysUntil, addDays } from '../../../shared/utils/index.js';
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

    const message = `
💳 *Your Subscription*

*Status:* 🆓 Free Trial
*Days Remaining:* ${daysLeft}
*Trial Ends:* ${fullClient.trial_end_date ? formatDate(new Date(fullClient.trial_end_date)) : 'N/A'}

Upgrade now to ensure uninterrupted service!
`;

    await ctx.reply(withFooter(message), {
      parse_mode: 'Markdown',
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

    const message = `
💳 *Your Subscription*

*Status:* ✅ Active
*Plan:* ${plan?.name || 'Unknown'}
*Renews:* ${fullClient.platform_subscription_end ? formatDate(new Date(fullClient.platform_subscription_end)) : 'N/A'}
*Days Left:* ${daysLeft}

${plan ? `*Plan Limits:*\n• Max Bots: ${plan.max_bots || 'Unlimited'}\n• Max Subscribers/Bot: ${plan.max_subscribers || 'Unlimited'}` : ''}
`;

    await ctx.reply(withFooter(message), {
      parse_mode: 'Markdown',
      reply_markup: keyboard,
    });
  } else if (fullClient.status === 'EXPIRED') {
    keyboard.text('🚀 Reactivate Now', 'platform_plans').row();
    keyboard.text('« Back', 'start');

    const message = `
💳 *Your Subscription*

*Status:* ⚠️ Expired

Your subscription has expired. Your selling bots are paused.

Reactivate now to resume service!
`;

    await ctx.reply(withFooter(message), {
      parse_mode: 'Markdown',
      reply_markup: keyboard,
    });
  } else {
    keyboard.text('« Back', 'start');
    await ctx.reply(
      withFooter(`💳 *Your Subscription*\n\n*Status:* ${fullClient.status}`),
      { parse_mode: 'Markdown', reply_markup: keyboard }
    );
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

  let message = '📋 *Platform Subscription Plans*\n\n';

  for (const plan of plans) {
    message += `*${plan.name}*\n`;
    message += `💰 ${formatPrice(Number(plan.price_amount), plan.price_currency)} / ${formatDuration(plan.duration_days)}\n`;
    if (plan.max_bots) message += `🤖 Up to ${plan.max_bots} bots\n`;
    if (plan.max_subscribers) message += `👥 Up to ${plan.max_subscribers} subscribers/bot\n`;
    if (plan.description) message += `📝 ${plan.description}\n`;
    message += '\n';

    keyboard.text(
      `${plan.name} - ${formatPrice(Number(plan.price_amount), plan.price_currency)}`,
      `select_platform_plan:${plan.id}`
    ).row();
  }

  keyboard.text('« Back', 'subscription');

  await ctx.reply(withFooter(message), {
    parse_mode: 'Markdown',
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
      orderDescription: `TeleTrade Platform - ${plan.name}`,
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

    const message = `
💳 *Payment for ${plan.name}*

*Amount:* ${formatPrice(Number(plan.price_amount), plan.price_currency)}
*Duration:* ${formatDuration(plan.duration_days)}

Click the button below to pay securely via NOWPayments.
You will be redirected to a hosted checkout page.

_Invoice expires in ${PLATFORM.INVOICE_EXPIRATION_MINUTES} minutes._
`;

    await ctx.reply(withFooter(message), {
      parse_mode: 'Markdown',
      reply_markup: keyboard,
    });

    logger.info({ clientId: client.id, planId, transactionId: transaction.id }, 'Platform invoice created');
  } catch (error) {
    logger.error({ error, planId }, 'Failed to create platform invoice');
    await ctx.reply('❌ Failed to generate payment invoice. Please try again.');
  }
}
