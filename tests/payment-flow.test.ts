
import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';
import { validateWebhookSignature } from '../src/shared/integrations/nowpayments.js';

// Mock config
vi.mock('../src/shared/config/index.js', () => ({
  config: {
    NOWPAYMENTS_IPN_SECRET: 'test-secret-key',
    LOG_LEVEL: 'silent',
  },
  isDevelopment: true,
  isProduction: false,
  PLATFORM: {
    INVOICE_EXPIRATION_MINUTES: 30,
  },
}));

describe('Payment Webhook Flow', () => {
  const secret = 'test-secret-key';

  describe('Signature Validation', () => {
    it('should reject invalid signatures', () => {
      const payload = JSON.stringify({ payment_id: 123 });
      const signature = 'invalid-signature';
      const result = validateWebhookSignature(payload, signature, secret);
      expect(result).toBe(false);
    });

    it('should accept valid signatures', () => {
      const payload = JSON.stringify({ payment_id: 123, status: 'confirmed' });
      // Generate valid HMAC
      const signature = crypto
        .createHmac('sha512', secret)
        .update(payload)
        .digest('hex');

      const result = validateWebhookSignature(payload, signature, secret);
      expect(result).toBe(true);
    });

    it('should handle sorting of keys correctly if implementation requires it', () => {
      // NOWPayments sends sorted JSON usually, but validation takes raw body
      // So order matters if we are re-serializing, but here we pass raw string
      const payload = '{"a":1,"b":2}';
      const signature = crypto
        .createHmac('sha512', secret)
        .update(payload)
        .digest('hex');

      expect(validateWebhookSignature(payload, signature, secret)).toBe(true);
    });
  });

  // Note: Testing the full RPC flow requires a running Supabase instance or docker container.
  // For this environment, we are testing the critical security logic (signatures).
});
