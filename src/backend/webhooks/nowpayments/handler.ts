/**
 * NOWPayments Webhook Handler (Supabase version)
 * Processes payment status updates
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { supabase, type PaymentTransaction, type SubscriptionPlan, type Subscriber, type Client, type SellingBot } from '../../../database/index.js';
import { validateWebhookSignature, mapPaymentStatus } from '../../../shared/integrations/nowpayments.js';
import { webhookLogger as logger } from '../../../shared/utils/index.js';
import { config } from '../../../shared/config/index.js';
import { grantChannelAccess } from '../../services/access-control/index.js';
import { addDays } from '../../../shared/utils/date.js';

interface WebhookBody {
  payment_id: number;
  invoice_id: number;
  payment_status: string;
  pay_address: string;
  price_amount: number;
  price_currency: string;
  pay_amount: number;
  pay_currency: string;
  actually_paid: number;
  order_id: string;
  order_description: string;
  outcome_amount: number;
  outcome_currency: string;
}

export function registerWebhookRoutes(app: FastifyInstance) {
  app.post<{ Body: WebhookBody }>(
    '/webhooks/nowpayments',
    async (request: FastifyRequest<{ Body: WebhookBody }>, reply: FastifyReply) => {
      const signature = request.headers['x-nowpayments-sig'] as string;
      const rawBody = JSON.stringify(request.body);

      logger.info({ invoiceId: request.body.invoice_id }, 'Received NOWPayments webhook');

      // Validate signature
      if (config.NOWPAYMENTS_IPN_SECRET) {
        const isValid = validateWebhookSignature(
          rawBody,
          signature || '',
          config.NOWPAYMENTS_IPN_SECRET
        );

        if (!isValid) {
          logger.warn({ invoiceId: request.body.invoice_id }, 'Invalid webhook signature');
          return reply.status(403).send({ error: 'Invalid signature' });
        }
      }

      const payload = request.body;

      try {
        // Find transaction by invoice ID with relations
        const { data } = await supabase
          .from('payment_transactions')
          .select(`
            *,
            subscription_plans(*),
            subscribers(
              *,
              selling_bots(*)
            ),
            clients(*)
          `)
          .eq('nowpayments_invoice_id', String(payload.invoice_id))
          .single();

        const transaction = data as (PaymentTransaction & { 
          subscription_plans: SubscriptionPlan; 
          subscribers: (Subscriber & { selling_bots: SellingBot }) | null;
          clients: Client | null;
        }) | null;

        if (!transaction) {
          logger.warn({ invoiceId: payload.invoice_id }, 'Transaction not found');
          return reply.status(200).send({ status: 'ignored', reason: 'transaction_not_found' });
        }

        const newStatus = mapPaymentStatus(payload.payment_status);

        // Idempotency check - don't reprocess same status
        if (transaction.payment_status === newStatus) {
          logger.debug({ invoiceId: payload.invoice_id, status: newStatus }, 'Duplicate webhook ignored');
          return reply.status(200).send({ status: 'duplicate' });
        }

        // Update transaction
        await (supabase
          .from('payment_transactions') as any)
          .update({
            payment_status: newStatus,
            nowpayments_payment_id: String(payload.payment_id),
            payment_address: payload.pay_address,
            transaction_hash: payload.outcome_currency ? `${payload.outcome_amount} ${payload.outcome_currency}` : null,
            confirmed_at: newStatus === 'CONFIRMED' ? new Date().toISOString() : undefined,
          })
          .eq('id', transaction.id);

        logger.info(
          { transactionId: transaction.id, oldStatus: transaction.payment_status, newStatus },
          'Transaction status updated'
        );

        // Handle confirmed payments
        if (newStatus === 'CONFIRMED') {
          await handleConfirmedPayment(transaction, payload);
        }

        // Handle failed/expired payments
        if (newStatus === 'FAILED' || newStatus === 'EXPIRED') {
          await handleFailedPayment(transaction);
        }

        return reply.status(200).send({ status: 'processed' });
      } catch (error) {
        logger.error({ error, invoiceId: payload.invoice_id }, 'Failed to process webhook');
        return reply.status(500).send({ error: 'Processing failed' });
      }
    }
  );
}

async function handleConfirmedPayment(
  transaction: any,
  payload: WebhookBody
) {
  const paymentType = transaction.payment_type;
  const subscriber = transaction.subscribers;
  const client = transaction.clients;
  const plan = transaction.subscription_plans;

  if (paymentType === 'SUBSCRIBER_SUBSCRIPTION' && subscriber) {
    const startDate = new Date();
    const endDate = addDays(startDate, plan.duration_days);

    // Update subscriber status
    await (supabase
      .from('subscribers') as any)
      .update({
        subscription_status: 'ACTIVE',
        subscription_start_date: startDate.toISOString(),
        subscription_end_date: endDate.toISOString(),
        subscription_plan_id: plan.id,
      })
      .eq('id', subscriber.id);

    // Grant channel access
    const bot = subscriber.selling_bots;
    if (bot?.linked_channel_id) {
      await grantChannelAccess(
        subscriber.id,
        bot.id,
        Number(subscriber.telegram_user_id),
        Number(bot.linked_channel_id),
        bot.bot_token
      );
    }

    // Log access grant
    await (supabase.from('access_control_logs') as any).insert({
      subscriber_id: subscriber.id,
      bot_id: bot.id,
      action: 'GRANT',
      performed_by: 'SYSTEM',
      reason: `Payment confirmed: ${payload.actually_paid} ${payload.pay_currency}`,
    });

    logger.info(
      { subscriberId: subscriber.id, planId: plan.id, endDate },
      'Subscriber subscription activated'
    );

  } else if (paymentType === 'PLATFORM_SUBSCRIPTION' && client) {
    const startDate = new Date();
    const endDate = addDays(startDate, plan.duration_days);

    await (supabase
      .from('clients') as any)
      .update({
        status: 'ACTIVE',
        platform_subscription_plan_id: plan.id,
        platform_subscription_start: startDate.toISOString(),
        platform_subscription_end: endDate.toISOString(),
      })
      .eq('id', client.id);

    // Reactivate any paused bots
    await (supabase
      .from('selling_bots') as any)
      .update({ status: 'ACTIVE' })
      .eq('client_id', client.id)
      .eq('status', 'PAUSED');

    logger.info(
      { clientId: client.id, planId: plan.id, endDate },
      'Client platform subscription activated'
    );
  }
}

async function handleFailedPayment(transaction: any) {
  logger.info(
    { transactionId: transaction.id, type: transaction.payment_type },
    'Payment failed or expired'
  );
}
