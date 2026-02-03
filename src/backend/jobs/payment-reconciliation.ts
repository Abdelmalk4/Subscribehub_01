/**
 * Payment Reconciliation Job
 * Daily job to detect webhook failures and auto-heal
 */

import { supabase, type PaymentTransaction } from '../../database/index.js';
import { cronLogger as logger } from '../../shared/utils/index.js';
import { config } from '../../shared/config/index.js';
import { manuallyProcessPayment } from '../services/payment/override.js';


/**
 * Run payment reconciliation
 * Checks NOWPayments for finished payments that aren't marked CONFIRMED locally
 */
export async function runPaymentReconciliation() {
  logger.info('Starting payment reconciliation...');

  try {
    // Get all transactions from last 24 hours that are not CONFIRMED
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const { data, error } = await supabase
      .from('payment_transactions')
      .select('*')
      .in('payment_status', ['PENDING', 'CONFIRMING'])
      .gte('created_at', yesterday.toISOString())
      .eq('payment_type', 'SUBSCRIBER_SUBSCRIPTION');

    if (error) {
      logger.error({ error }, 'Failed to fetch pending transactions');
      return;
    }

    const transactions = data as PaymentTransaction[] | null;

    if (!transactions || transactions.length === 0) {
      logger.info('No pending transactions to reconcile');
      return;
    }

    logger.info({ count: transactions.length }, 'Found pending transactions to check');

    let reconciledCount = 0;
    let errorCount = 0;

    // Check each transaction with NOWPayments API
    for (const tx of transactions) {
      if (!tx.nowpayments_invoice_id) {
        logger.warn({ txId: tx.id }, 'Transaction missing invoice ID, skipping');
        continue;
      }

      try {
        // Query NOWPayments API for payment status
        const response = await fetch(
          `https://api.nowpayments.io/v1/payment/${tx.nowpayments_invoice_id}`,
          {
            headers: {
              'x-api-key': config.NOWPAYMENTS_API_KEY || '',
            },
          }
        );

        if (!response.ok) {
          logger.warn({ 
            txId: tx.id, 
            invoiceId: tx.nowpayments_invoice_id,
            status: response.status 
          }, 'NOWPayments API error');
          errorCount++;
          continue;
        }

        const paymentData = await response.json() as any;

        // Check if payment is finished on NOWPayments side
        if (['finished', 'confirmed', 'partially_paid'].includes(paymentData.payment_status?.toLowerCase())) {
          logger.warn({ 
            txId: tx.id, 
            invoiceId: tx.nowpayments_invoice_id,
            nowpaymentsStatus: paymentData.payment_status,
            localStatus: tx.payment_status
          }, 'Payment mismatch detected - auto-healing');

          // Auto-heal by manually processing
          const result = await manuallyProcessPayment(tx.id, 'SYSTEM_RECONCILIATION');

          if (result.success) {
            reconciledCount++;
            logger.info({ txId: tx.id }, 'Payment reconciled successfully');
          } else {
            errorCount++;
            logger.error({ txId: tx.id, error: result.error }, 'Failed to reconcile payment');
          }
        }
      } catch (error) {
        logger.error({ error, txId: tx.id }, 'Error checking payment with NOWPayments');
        errorCount++;
      }
    }

    logger.info({ 
      total: transactions.length, 
      reconciled: reconciledCount, 
      errors: errorCount 
    }, 'Payment reconciliation completed');

    // Notify admin if there were reconciliations or errors
    if (reconciledCount > 0 || errorCount > 0) {
      await notifyAdminOfReconciliation(reconciledCount, errorCount);
    }
  } catch (error) {
    logger.error({ error }, 'Payment reconciliation failed');
  }
}

/**
 * Notify admin of reconciliation results
 */
async function notifyAdminOfReconciliation(reconciledCount: number, errorCount: number) {
  try {
    // Get first admin
    const { data } = await supabase
      .from('platform_admins')
      .select('telegram_user_id')
      .limit(1)
      .single();

    if (!data) return;

    const admin = data as { telegram_user_id: number };

    const { Bot } = await import('grammy');
    const { MessageBuilder } = await import('../../shared/utils/index.js');

    
    const mainBot = new Bot(config.MAIN_BOT_TOKEN);

    const message = new MessageBuilder()
      .header('🔄', 'Payment Reconciliation Report')
      .break()
      .field('Auto-Healed', `${reconciledCount} payments`)
      .field('Errors', `${errorCount} payments`)
      .break()
      .line('Some webhook failures were detected and automatically fixed.')
      .toString();

    await mainBot.api.sendMessage(admin.telegram_user_id, message, {
      parse_mode: 'HTML',
    });

    logger.info({ reconciledCount, errorCount }, 'Admin notified of reconciliation');
  } catch (error) {
    logger.error({ error }, 'Failed to notify admin of reconciliation');
  }
}
