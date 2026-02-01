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
import { Bot } from 'grammy';
import { safeSendMessage } from '../../../shared/integrations/telegram.js';
import { PLATFORM } from '../../../shared/config/index.js';

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
  created_at?: string; // NOWPayments may include this
  updated_at?: string; // NOWPayments may include this
}

// Webhook replay protection window (5 minutes)
const WEBHOOK_MAX_AGE_MS = 5 * 60 * 1000;

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

      // Webhook replay protection - reject old webhooks
      if (payload.updated_at) {
        const webhookTime = new Date(payload.updated_at).getTime();
        const now = Date.now();
        if (now - webhookTime > WEBHOOK_MAX_AGE_MS) {
          logger.warn({ 
            invoiceId: payload.invoice_id, 
            webhookAge: (now - webhookTime) / 1000 
          }, 'Webhook too old - potential replay attack');
          return reply.status(400).send({ error: 'Webhook expired' });
        }
      }

      try {
        // Idempotency check - prevent replay attacks and duplicate processing
        const { data: existingTx } = await supabase
          .from('payment_transactions')
          .select('payment_status')
          .eq('nowpayments_invoice_id', String(payload.invoice_id))
          .single();

        // Cast to any to handle missing generated types
        const txStatus = (existingTx as { payment_status: string } | null)?.payment_status;
        if (txStatus === 'CONFIRMED') {
          logger.info({ invoiceId: payload.invoice_id }, 'Payment already confirmed, skipping');
          return reply.status(200).send({ status: 'already_processed' });
        }


        // Atomic Processing via RPC
        // Use any cast to bypass strict RPC typing since generated types are missing
        const { data: result, error } = await (supabase.rpc as any)('process_payment_webhook', {
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
// Side-effects handler: Access Granting & Notifications
async function triggerPostPaymentActions(invoiceId: number) {
    const { data: transaction } = await supabase
        .from('payment_transactions')
        .select(`*, subscribers(*, selling_bots(*)), clients(*)`)
        .eq('nowpayments_invoice_id', String(invoiceId))
        .single();
    
    // Explicitly check for null transaction
    if (!transaction) return;

    // Use safe access with optional chaining and manual casting if needed
    const tx = transaction as any;

    // Case 1: Subscriber Payment (Grant Access)
    if (tx.subscribers && tx.subscribers.selling_bots) {
        const sub = tx.subscribers;
        const bot = sub.selling_bots;

        // Decrypt Token for use
        let botToken = bot.bot_token;
        if (botToken.includes(':')) { // simple check if encrypted
             // Dynamic Import to avoid circular dependencies if any
             const { decrypt } = await import('../../../shared/utils/encryption.js');
             try { 
               botToken = decrypt(botToken); 
             } catch (decryptError) {
               logger.error({ error: decryptError, botId: bot.id }, 'Failed to decrypt bot token in post-payment action - using raw token');
               // Continue with unencrypted token as fallback, but log the issue
             }
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

    // Case 2: Client Platform Payment (Notify Client)
    if (tx.clients) {
        const client = tx.clients;
        if (!client.telegram_user_id) return;

        try {
            // Use fresh bot instance to avoid context issues
            const mainBot = new Bot(config.MAIN_BOT_TOKEN);
            
            await safeSendMessage(
                mainBot, 
                Number(client.telegram_user_id), 
                `✅ *Payment Received*\n\nYour platform subscription has been activated! Thank you for choosing ${PLATFORM.NAME}.\n\nUse /subscription to view your status.`, 
                { parse_mode: 'HTML' }
            );
            
            logger.info({ clientId: client.id }, 'Client notified of platform payment');
        } catch (error) {
            logger.error({ error, clientId: client.id }, 'Failed to notify client of payment');
        }
    }
}

