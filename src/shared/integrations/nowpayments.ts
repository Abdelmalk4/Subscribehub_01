/**
 * NOWPayments API Client
 * Non-custodial crypto payment integration
 */

import ky from 'ky';
import type { NOWPaymentsInvoice } from '../types/index.js';
import { createLogger } from '../utils/logger.js';
import { PLATFORM } from '../config/index.js';

const logger = createLogger('nowpayments');

const NOWPAYMENTS_API_URL = 'https://api.nowpayments.io/v1';

interface CreateInvoiceParams {
  apiKey: string;
  priceAmount: number;
  priceCurrency: string;
  payCurrency?: string;
  orderId: string;
  orderDescription: string;
  ipnCallbackUrl: string;
  successUrl?: string;
  cancelUrl?: string;
}

interface InvoiceResponse {
  id: string;
  token_id: string;
  order_id: string;
  order_description: string;
  price_amount: number;
  price_currency: string;
  pay_currency: string | null;
  ipn_callback_url: string;
  invoice_url: string;
  success_url: string | null;
  cancel_url: string | null;
  created_at: string;
  updated_at: string;
  is_fixed_rate: boolean;
  is_fee_paid_by_user: boolean;
}

interface PaymentStatusResponse {
  payment_id: number;
  invoice_id: number | null;
  payment_status: string;
  pay_address: string;
  price_amount: number;
  price_currency: string;
  pay_amount: number;
  actually_paid: number;
  pay_currency: string;
  order_id: string;
  order_description: string;
  purchase_id: string;
  created_at: string;
  updated_at: string;
  outcome_amount: number | null;
  outcome_currency: string | null;
}

/**
 * Create a payment invoice
 */
export async function createInvoice(params: CreateInvoiceParams): Promise<NOWPaymentsInvoice> {
  const {
    apiKey,
    priceAmount,
    priceCurrency,
    payCurrency,
    orderId,
    orderDescription,
    ipnCallbackUrl,
    successUrl,
    cancelUrl,
  } = params;

  logger.info({ orderId, priceAmount, priceCurrency }, 'Creating NOWPayments invoice');

  try {
    const response = await ky
      .post(`${NOWPAYMENTS_API_URL}/invoice`, {
        headers: {
          'x-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        json: {
          price_amount: priceAmount,
          price_currency: priceCurrency.toLowerCase(),
          pay_currency: payCurrency?.toLowerCase(),
          order_id: orderId,
          order_description: orderDescription,
          ipn_callback_url: ipnCallbackUrl,
          success_url: successUrl,
          cancel_url: cancelUrl,
          is_fixed_rate: false,
          is_fee_paid_by_user: false,
        },
        timeout: 30000,
      })
      .json<InvoiceResponse>();

    logger.info({ invoiceId: response.id, orderId }, 'Invoice created successfully');

    return {
      id: response.id,
      order_id: response.order_id,
      order_description: response.order_description,
      price_amount: response.price_amount,
      price_currency: response.price_currency,
      pay_amount: 0, // Will be set when customer selects currency
      pay_currency: response.pay_currency || priceCurrency,
      pay_address: '', // Will be set when customer selects currency
      invoice_url: response.invoice_url,
      created_at: response.created_at,
      updated_at: response.updated_at,
      expiration_estimate_date: new Date(
        Date.now() + PLATFORM.INVOICE_EXPIRATION_MINUTES * 60 * 1000
      ).toISOString(),
    };
  } catch (error) {
    logger.error({ error, orderId }, 'Failed to create invoice');
    throw new Error('Failed to create payment invoice');
  }
}

/**
 * Get payment status by payment ID
 */
export async function getPaymentStatus(
  apiKey: string,
  paymentId: number
): Promise<PaymentStatusResponse> {
  logger.debug({ paymentId }, 'Checking payment status');

  try {
    const response = await ky
      .get(`${NOWPAYMENTS_API_URL}/payment/${paymentId}`, {
        headers: {
          'x-api-key': apiKey,
        },
        timeout: 15000,
      })
      .json<PaymentStatusResponse>();

    return response;
  } catch (error) {
    logger.error({ error, paymentId }, 'Failed to get payment status');
    throw new Error('Failed to check payment status');
  }
}

/**
 * Response from invoice payments endpoint
 */
interface InvoicePaymentInfo {
  id: number;
  invoice_id: number;
  order_id: string;
  order_description: string;
  price_amount: number;
  price_currency: string;
  pay_currency: string;
  pay_amount: number;
  actually_paid: number;
  pay_address: string;
  payment_status: string;
  purchase_id: string;
  created_at: string;
  updated_at: string;
}

interface InvoicePaymentsResponse {
  data: InvoicePaymentInfo[];
  total: number;
}

/**
 * Get payments for an invoice by invoice ID
 * This is useful for checking payment status when webhooks may be delayed
 */
export async function getInvoicePayments(
  apiKey: string,
  invoiceId: string
): Promise<InvoicePaymentsResponse> {
  logger.debug({ invoiceId }, 'Fetching payments for invoice');

  try {
    const response = await ky
      .get(`${NOWPAYMENTS_API_URL}/invoice-payment/${invoiceId}`, {
        headers: {
          'x-api-key': apiKey,
        },
        timeout: 15000,
      })
      .json<InvoicePaymentsResponse>();

    return response;
  } catch (error) {
    logger.error({ error, invoiceId }, 'Failed to get invoice payments');
    throw new Error('Failed to check invoice payments');
  }
}

/**
 * Validate webhook signature
 */
export function validateWebhookSignature(
  payload: string,
  signature: string,
  ipnSecret: string
): boolean {
  const crypto = require('crypto') as typeof import('crypto');
  const hmac = crypto.createHmac('sha512', ipnSecret);
  hmac.update(payload);
  const calculatedSignature = hmac.digest('hex');

  // Constant-time comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(calculatedSignature)
    );
  } catch {
    return false;
  }
}

/**
 * Map NOWPayments status to our internal status
 */
export function mapPaymentStatus(
  nowpaymentsStatus: string
): 'PENDING' | 'CONFIRMING' | 'CONFIRMED' | 'FAILED' | 'EXPIRED' | 'REFUNDED' {
  switch (nowpaymentsStatus.toLowerCase()) {
    case 'waiting':
    case 'pending':
      return 'PENDING';
    case 'confirming':
    case 'sending':
      return 'CONFIRMING';
    case 'finished':
    case 'confirmed':
    case 'partially_paid':
      return 'CONFIRMED';
    case 'failed':
      return 'FAILED';
    case 'expired':
      return 'EXPIRED';
    case 'refunded':
      return 'REFUNDED';
    default:
      return 'PENDING';
  }
}
