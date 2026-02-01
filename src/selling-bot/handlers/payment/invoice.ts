/**
 * Payment Invoice Handler (Supabase version)
 */

import { Bot, InlineKeyboard } from 'grammy';
import type { SellingBotContext } from '../../../shared/types/index.js';
import { supabase, type SubscriptionPlan, type PaymentTransaction } from '../../../database/index.js';
import { createInvoice } from '../../../shared/integrations/nowpayments.js';
import { withFooter, formatPrice, addDays, escapeHtml } from '../../../shared/utils/index.js';
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

    const message = `
💳 <b>Payment Invoice Created</b>

<b>Plan:</b> ${escapeHtml(plan.name)}
<b>Amount:</b> ${formatPrice(plan.price_amount, plan.price_currency)}

Click the button below to complete payment:

⏱️ This invoice expires in ${PLATFORM.INVOICE_EXPIRATION_MINUTES} minutes.
`;

    await ctx.reply(withFooter(message), {
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
    const status = transaction.payment_status;

    if (status === 'CONFIRMED') {
      await ctx.reply(
        withFooter('✅ <b>Payment Confirmed!</b>\n\nYour subscription is now active.\n\nUse /start to access your subscription details.'),
        { parse_mode: 'HTML' }
      );
      return;
    }

    if (status === 'CONFIRMING') {
      keyboard.text('🔄 Check Again', `check_payment:${transactionId}`);
      await ctx.reply(
        withFooter('⏳ <b>Payment Detected</b>\n\nYour payment is being confirmed. This usually takes 1-3 blockchain confirmations.'),
        { parse_mode: 'HTML', reply_markup: keyboard }
      );
      return;
    }

    if (status === 'EXPIRED') {
      keyboard.text('📋 View Plans', 'plans');
      await ctx.reply(
        withFooter('⚠️ <b>Invoice Expired</b>\n\nPlease create a new invoice to continue.'),
        { parse_mode: 'HTML', reply_markup: keyboard }
      );
      return;
    }

    if (status === 'FAILED') {
      keyboard.text('📋 Try Again', 'plans');
      await ctx.reply(
        withFooter('❌ <b>Payment Failed</b>\n\nPlease try again or contact support.'),
        { parse_mode: 'HTML', reply_markup: keyboard }
      );
      return;
    }

    keyboard.text('🔄 Check Again', `check_payment:${transactionId}`).row().text('❌ Cancel', 'plans');
    await ctx.reply(
      withFooter('⏳ <b>Awaiting Payment</b>\n\nWe have not detected a payment yet.'),
      { parse_mode: 'HTML', reply_markup: keyboard }
    );
  } catch (error) {
    logger.error({ error, transactionId }, 'Failed to check payment status');
    await ctx.reply('❌ Failed to check status. Please try again.');
  }
}
