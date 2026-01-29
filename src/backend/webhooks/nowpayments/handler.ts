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

      // Mandatory Signature Validation
      if (!config.NOWPAYMENTS_IPN_SECRET) {
         logger.fatal('Missing NOWPAYMENTS_IPN_SECRET configuration');
         return reply.status(500).send({ error: 'System configuration error' });
      }

      const isValid = validateWebhookSignature(
        rawBody,
        signature || '',
        config.NOWPAYMENTS_IPN_SECRET
      );

      if (!isValid) {
        logger.warn({ invoiceId: request.body.invoice_id }, 'Invalid webhook signature');
        return reply.status(403).send({ error: 'Invalid signature' });
      }

      const payload = request.body;

      try {
        // Atomic Processing via RPC
        const { data: result, error } = await supabase.rpc('process_payment_webhook', {
          p_invoice_id: String(payload.invoice_id),
          p_payment_status: payload.payment_status,
          p_actually_paid: payload.actually_paid || 0,
          p_pay_currency: payload.pay_currency
        });

        if (error) {
          logger.error({ error, invoiceId: payload.invoice_id }, 'RPC failed');
          return reply.status(500).send({ error: 'Processing failed' });
        }

        const response = result as any;

        if (response.status === 'success' && response.action === 'activated_subscriber') {
             // Access granting can remain here as side-effect, but state is already safe
             await triggerPostPaymentActions(payload.invoice_id);
        }

        logger.info({ invoiceId: payload.invoice_id, result: response }, 'Webhook processed');
        return reply.status(200).send({ status: 'processed', detail: response });

      } catch (error) {
        logger.error({ error, invoiceId: payload.invoice_id }, 'Failed to process payment');
        return reply.status(500).send({ error: 'Processing failed' });
      }
    }
  );
}

// Side-effects handler: Access Granting (Idempotent-ish check)
async function triggerPostPaymentActions(invoiceId: number) {
    const { data: transaction } = await supabase
        .from('payment_transactions')
        .select(`*, subscribers(*, selling_bots(*))`)
        .eq('nowpayments_invoice_id', String(invoiceId))
        .single();
    
    if (!transaction || !transaction.subscribers || !transaction.subscribers.selling_bots) return;

    const sub = transaction.subscribers;
    const bot = sub.selling_bots;

    // Decrypt Token for use
    let botToken = bot.bot_token;
    if (botToken.includes(':')) { // simple check if encrypted
         // Dynamic Import to avoid circular dependencies if any
         const { decrypt } = await import('../../../shared/utils/encryption.js');
         try { botToken = decrypt(botToken); } catch {}
    }

    if (bot.linked_channel_id) {
       await grantChannelAccess(
         sub.id,
         bot.id,
         Number(sub.telegram_user_id),
         Number(bot.linked_channel_id),
         botToken
       );
    }
}

