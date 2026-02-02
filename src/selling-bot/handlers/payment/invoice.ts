/**
 * Payment Invoice Handler (Supabase version)
 */

import { Bot, InlineKeyboard } from 'grammy';
import type { SellingBotContext } from '../../../shared/types/index.js';
import { supabase, type SubscriptionPlan, type PaymentTransaction } from '../../../database/index.js';
import { createInvoice } from '../../../shared/integrations/nowpayments.js';
import { withFooter, formatPrice, addDays, escapeHtml, MessageBuilder } from '../../../shared/utils/index.js';
import { sellingBotLogger as logger } from '../../../shared/utils/index.js';
import { config, PLATFORM } from '../../../shared/config/index.js';

export function setupPaymentHandler(bot: Bot<SellingBotContext>) {
  bot.callbackQuery(/^create_invoice:(.+)$/, async (ctx) => {
    const planId = ctx.match[1];
    await ctx.answerCallbackQuery('Generating invoice...');
    await createPaymentInvoice(ctx, planId);
  });

  bot.callbackQuery(/^check_payment:(.+)$/, async (ctx) => {
    const transactionId = ctx.match[1];
    await ctx.answerCallbackQuery('Checking...');
    await checkPaymentStatus(ctx, transactionId);
  });
}

async function createPaymentInvoice(ctx: SellingBotContext, planId: string) {
  const botConfig = ctx.botConfig!;
  const subscriber = ctx.subscriber!;

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

    const orderId = `sub_${subscriber.id}_${Date.now()}`;

    const invoice = await createInvoice({
      apiKey: botConfig.nowpaymentsApiKey,
      priceAmount: plan.price_amount,
      priceCurrency: plan.price_currency,
      orderId,
      orderDescription: `${plan.name} subscription`,
      ipnCallbackUrl: config.NOWPAYMENTS_IPN_CALLBACK_URL || '',
    });

    const { data: transactionData } = await (supabase
      .from('payment_transactions') as any)
      .insert({
        payment_type: 'SUBSCRIBER_SUBSCRIPTION',
        subscriber_id: subscriber.id,
        plan_id: plan.id,
        nowpayments_invoice_id: String(invoice.id),
        amount: plan.price_amount,
        currency: plan.price_currency,
        payment_status: 'PENDING',
        expires_at: new Date(Date.now() + PLATFORM.INVOICE_EXPIRATION_MINUTES * 60 * 1000).toISOString(),
      })
      .select()
      .single();

    const transaction = transactionData as PaymentTransaction | null;

    ctx.session.purchase = {
      step: 'awaiting_payment',
      planId: plan.id,
      invoiceId: String(invoice.id),
      amount: plan.price_amount,
      currency: plan.price_currency,
    };

    const keyboard = new InlineKeyboard()
      .url('🌐 Pay on NOWPayments', invoice.invoice_url)
      .row()
      .text('🔄 Check Payment Status', `check_payment:${transaction?.id}`)
      .row()
      .text('❌ Cancel', 'plans');

    const message = new MessageBuilder()
      .header('💳', 'Payment Invoice Created')
      .break()
      .field('Plan', plan.name)
      .field('Amount', formatPrice(plan.price_amount, plan.price_currency))
      .break()
      .line('Click the button below to complete payment:')
      .break()
      .info(`⏱️ This invoice expires in ${PLATFORM.INVOICE_EXPIRATION_MINUTES} minutes.`)
      .toString();

    await ctx.reply(message, {
      parse_mode: 'HTML',
      reply_markup: keyboard,
    });

    logger.info({ transactionId: transaction?.id, subscriberId: subscriber.id, planId }, 'Payment invoice created');
  } catch (error) {
    logger.error({ error, planId, subscriberId: subscriber.id }, 'Failed to create invoice');
    await ctx.reply('❌ Failed to generate payment invoice. Please try again.');
  }
}

async function checkPaymentStatus(ctx: SellingBotContext, transactionId: string) {
  const botConfig = ctx.botConfig!;
  
  try {
    const { data } = await supabase
      .from('payment_transactions')
      .select('*, subscription_plans(*)')
      .eq('id', transactionId)
      .single();

    const transaction = data as (PaymentTransaction & { subscription_plans: SubscriptionPlan }) | null;

    if (!transaction) {
      await ctx.reply('❌ Transaction not found.');
      return;
    }

    const keyboard = new InlineKeyboard();
    let status = transaction.payment_status;

    // If status is PENDING, poll NOWPayments API for real-time status
    if (status === 'PENDING' && transaction.nowpayments_invoice_id) {
      try {
        const { getInvoicePayments, mapPaymentStatus } = await import('../../../shared/integrations/nowpayments.js');
        const invoicePayments = await getInvoicePayments(
          botConfig.nowpaymentsApiKey,
          transaction.nowpayments_invoice_id
        );

        if (invoicePayments.data && invoicePayments.data.length > 0) {
          const latestPayment = invoicePayments.data[0];
          const newStatus = mapPaymentStatus(latestPayment.payment_status);

          // Update DB if status has changed
          if (newStatus !== status) {
            await (supabase
              .from('payment_transactions') as any)
              .update({ 
                payment_status: newStatus,
                updated_at: new Date().toISOString()
              })
              .eq('id', transactionId);

            status = newStatus;
            logger.info({ transactionId, oldStatus: transaction.payment_status, newStatus }, 'Payment status updated from API poll');

            // If confirmed, trigger the webhook processing to grant access
            if (newStatus === 'CONFIRMED') {
              const { supabase: db } = await import('../../../database/index.js');
              await (db.rpc as any)('process_payment_webhook', {
                p_invoice_id: transaction.nowpayments_invoice_id,
                p_payment_status: 'finished',
                p_actually_paid: latestPayment.actually_paid || transaction.amount,
                p_pay_currency: latestPayment.pay_currency || transaction.currency
              });
            }
          }
        }
      } catch (pollError) {
        logger.warn({ pollError, transactionId }, 'Failed to poll NOWPayments API, using cached status');
        // Continue with cached status from DB
      }
    }

    if (status === 'CONFIRMED') {
      const message = new MessageBuilder()
        .header('✅', 'Payment Confirmed!')
        .break()
        .line('Your subscription is now active.')
        .line('Use /start to access your subscription details.')
        .toString();

      await ctx.reply(message, { parse_mode: 'HTML' });
      return;
    }

    if (status === 'CONFIRMING') {
      keyboard.text('🔄 Check Again', `check_payment:${transactionId}`);
      const message = new MessageBuilder()
        .header('⏳', 'Payment Detected')
        .break()
        .line('Your payment is being confirmed. This usually takes 1-3 blockchain confirmations.')
        .toString();

      await ctx.reply(message, { parse_mode: 'HTML', reply_markup: keyboard });
      return;
    }

    if (status === 'EXPIRED') {
      keyboard.text('📋 View Plans', 'plans');
      const message = new MessageBuilder()
        .header('⚠️', 'Invoice Expired')
        .break()
        .line('Please create a new invoice to continue.')
        .toString();

      await ctx.reply(message, { parse_mode: 'HTML', reply_markup: keyboard });
      return;
    }

    if (status === 'FAILED') {
      keyboard.text('📋 Try Again', 'plans');
      const message = new MessageBuilder()
        .header('❌', 'Payment Failed')
        .break()
        .line('Please try again or contact support.')
        .toString();

      await ctx.reply(message, { parse_mode: 'HTML', reply_markup: keyboard });
      return;
    }

    keyboard.text('🔄 Check Again', `check_payment:${transactionId}`).row().text('❌ Cancel', 'plans');
    const message = new MessageBuilder()
      .header('⏳', 'Awaiting Payment')
      .break()
      .line('We have not detected a payment yet.')
      .toString();

    await ctx.reply(message, { parse_mode: 'HTML', reply_markup: keyboard });
  } catch (error) {
    logger.error({ error, transactionId }, 'Failed to check payment status');
    await ctx.reply('❌ Failed to check status. Please try again.');
  }
}

