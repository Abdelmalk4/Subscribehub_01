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

  // Check platform payment status
  bot.callbackQuery(/^check_platform_payment:(.+)$/, clientOnly(), async (ctx) => {
    const transactionId = ctx.match[1];
    await ctx.answerCallbackQuery('Checking...');
    await checkPlatformPaymentStatus(ctx, transactionId);
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
      .text('🔄 Check Payment Status', `check_platform_payment:${transaction.id}`)
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

async function checkPlatformPaymentStatus(ctx: MainBotContext, transactionId: string) {
  try {
    const { data } = await supabase
      .from('payment_transactions')
      .select('*, subscription_plans(*)')
      .eq('id', transactionId)
      .single();

    const transaction = data as any;

    if (!transaction) {
      await ctx.reply('❌ Transaction not found.');
      return;
    }

    const keyboard = new InlineKeyboard();
    let status = transaction.payment_status;

    // If status is PENDING or CONFIRMING, poll NOWPayments API for real-time status
    if ((status === 'PENDING' || status === 'CONFIRMING') && transaction.nowpayments_invoice_id) {
      try {
        const { getInvoicePayments, mapPaymentStatus } = await import('../../../shared/integrations/nowpayments.js');
        
        logger.info({ transactionId, invoiceId: transaction.nowpayments_invoice_id }, 'Polling NOWPayments API for status');
        
        const invoicePayments = await getInvoicePayments(
          config.NOWPAYMENTS_API_KEY!,
          transaction.nowpayments_invoice_id
        );

        logger.info({ 
          transactionId, 
          paymentsCount: invoicePayments.data?.length || 0,
          rawResponse: JSON.stringify(invoicePayments).substring(0, 500)
        }, 'NOWPayments API response');

        if (invoicePayments.data && invoicePayments.data.length > 0) {
          // Get the most recent payment
          const latestPayment = invoicePayments.data[0];
          const nowpaymentsStatus = latestPayment.payment_status;
          const newStatus = mapPaymentStatus(nowpaymentsStatus);

          logger.info({ 
            transactionId, 
            nowpaymentsStatus,
            mappedStatus: newStatus,
            actuallyPaid: latestPayment.actually_paid,
            expectedAmount: transaction.amount
          }, 'Payment status from API');

          // Update DB if status has changed
          if (newStatus !== status) {
            await (supabase
              .from('payment_transactions') as any)
              .update({
                payment_status: newStatus,
                updated_at: new Date().toISOString(),
                ...(newStatus === 'CONFIRMED' ? { confirmed_at: new Date().toISOString() } : {})
              })
              .eq('id', transactionId);

            status = newStatus;
            logger.info({ transactionId, oldStatus: transaction.payment_status, newStatus }, 'Platform payment status updated from API poll');

            // If confirmed, trigger the RPC to activate subscription
            if (newStatus === 'CONFIRMED') {
              logger.info({ transactionId }, 'Triggering subscription activation via RPC');
              
              const { data: rpcResult, error: rpcError } = await (supabase.rpc as any)('process_payment_webhook', {
                p_invoice_id: transaction.nowpayments_invoice_id,
                p_payment_status: 'finished',
                p_actually_paid: latestPayment.actually_paid || transaction.amount,
                p_pay_currency: latestPayment.pay_currency || transaction.currency
              });

              if (rpcError) {
                logger.error({ rpcError, transactionId }, 'RPC subscription activation failed');
              } else {
                logger.info({ rpcResult, transactionId }, 'RPC subscription activation completed');
              }
            }
          }
        } else {
          logger.info({ transactionId }, 'No payments found for this invoice yet');
        }
      } catch (pollError) {
        logger.error({ pollError, transactionId }, 'Failed to poll NOWPayments API for platform payment');
        // Continue with cached status from DB
      }
    }

    if (status === 'CONFIRMED') {
      const message = new MessageBuilder()
        .header('✅', 'Payment Confirmed!')
        .break()
        .line('Your platform subscription is now active.')
        .line('Use /subscription to view your status.')
        .toString();

      await ctx.reply(message, { parse_mode: 'HTML' });
      return;
    }

    if (status === 'CONFIRMING') {
      keyboard.text('🔄 Check Again', `check_platform_payment:${transactionId}`);
      const message = new MessageBuilder()
        .header('⏳', 'Payment Detected')
        .break()
        .line('Your payment is being confirmed. This usually takes 1-3 blockchain confirmations.')
        .toString();

      await ctx.reply(message, { parse_mode: 'HTML', reply_markup: keyboard });
      return;
    }

    if (status === 'EXPIRED') {
      keyboard.text('📋 View Plans', 'platform_plans');
      const message = new MessageBuilder()
        .header('⚠️', 'Invoice Expired')
        .break()
        .line('Please create a new invoice to continue.')
        .toString();

      await ctx.reply(message, { parse_mode: 'HTML', reply_markup: keyboard });
      return;
    }

    if (status === 'FAILED') {
      keyboard.text('📋 Try Again', 'platform_plans');
      const message = new MessageBuilder()
        .header('❌', 'Payment Failed')
        .break()
        .line('Please try again or contact support.')
        .toString();

      await ctx.reply(message, { parse_mode: 'HTML', reply_markup: keyboard });
      return;
    }

    keyboard.text('🔄 Check Again', `check_platform_payment:${transactionId}`).row().text('« Back', 'platform_plans');
    const message = new MessageBuilder()
      .header('⏳', 'Awaiting Payment')
      .break()
      .line('We have not detected a payment yet.')
      .toString();

    await ctx.reply(message, { parse_mode: 'HTML', reply_markup: keyboard });
  } catch (error) {
    logger.error({ error, transactionId }, 'Failed to check platform payment status');
    await ctx.reply('❌ Failed to check status. Please try again.');
  }
}
