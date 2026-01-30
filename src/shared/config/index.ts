/**
 * TeleTrade Configuration
 * Centralized configuration with environment variables
 */

import { z } from 'zod';
import 'dotenv/config';

// =================================
// Environment Schema
// =================================

const envSchema = z.object({
  // Supabase
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  DATABASE_URL: z.string().min(1),

  // Main Bot
  MAIN_BOT_TOKEN: z.string().min(1),
  PLATFORM_ADMIN_IDS: z.string().transform((val) => 
    val.split(',').map((id) => BigInt(id.trim()))
  ),

  // Selling Bot
  SELLING_BOT_WEBHOOK_BASE_URL: z.string().url().optional(),

  // NOWPayments
  NOWPAYMENTS_IPN_CALLBACK_URL: z.string().url().optional(),
  NOWPAYMENTS_IPN_SECRET: z.string().min(1),
  NOWPAYMENTS_API_KEY: z.string().optional(),
  
  // Monitoring
  SENTRY_DSN: z.string().url().optional(),

  // Security
  ADMIN_API_KEY: z.string().min(1),
  ENCRYPTION_KEY: z.string().length(64).regex(/^[0-9a-f]+$/), // 32 bytes in hex
  ALLOWED_ORIGINS: z.string().default('*').transform(val => val.split(',')),

  // Platform
  PLATFORM_NAME: z.string().default('TeleTrade'),
  PLATFORM_FOOTER_TEXT: z.string().default('Powered by TeleTrade'),
  TRIAL_DURATION_DAYS: z.coerce.number().default(7),
  GRACE_PERIOD_DAYS: z.coerce.number().default(3),

  // Environment
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
});

// =================================
// Parse & Export Configuration
// =================================

const parseResult = envSchema.safeParse(process.env);

if (!parseResult.success) {
  console.error('❌ Invalid environment configuration:');
  console.error(parseResult.error.format());
  process.exit(1);
}

export const config = parseResult.data;

// =================================
// Derived Configuration
// =================================

export const isDevelopment = config.NODE_ENV === 'development';
export const isProduction = config.NODE_ENV === 'production';

// =================================
// Platform Constants
// =================================

export const PLATFORM = {
  NAME: config.PLATFORM_NAME,
  FOOTER: config.PLATFORM_FOOTER_TEXT,
  TRIAL_DAYS: config.TRIAL_DURATION_DAYS,
  GRACE_PERIOD_DAYS: config.GRACE_PERIOD_DAYS,
  
  // Rate limits
  MAX_REQUESTS_PER_MINUTE: 100,
  
  // Invoice expiration (30 minutes)
  INVOICE_EXPIRATION_MINUTES: 30,
  
  // Reminder days before expiration
  REMINDER_DAYS: [7, 3, 1] as const,
} as const;

// =================================
// Telegram Limits
// =================================

export const TELEGRAM = {
  // Maximum message length
  MAX_MESSAGE_LENGTH: 4096,
  
  // Maximum callback data length
  MAX_CALLBACK_DATA: 64,
  
  // Rate limit (messages per second per chat)
  RATE_LIMIT_CHAT: 1,
  
  // Rate limit (messages per second overall)
  RATE_LIMIT_OVERALL: 30,
} as const;
