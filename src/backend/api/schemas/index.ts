/**
 * API Request Validation Schemas
 * Zod schemas for type-safe request validation
 */

import { z } from 'zod';

// =============================================
// Client Schemas
// =============================================

export const createClientSchema = z.object({
  telegram_user_id: z.number().int().positive(),
  username: z.string().max(50).optional(),
  business_name: z.string().min(1).max(100),
  contact_email: z.string().email().optional(),
  channel_username: z.string().max(50).optional(),
});

export const updateClientSchema = z.object({
  business_name: z.string().min(1).max(100).optional(),
  contact_email: z.string().email().optional(),
  status: z.enum(['PENDING', 'ACTIVE', 'TRIAL', 'EXPIRED', 'SUSPENDED']).optional(),
});

export type CreateClientInput = z.infer<typeof createClientSchema>;
export type UpdateClientInput = z.infer<typeof updateClientSchema>;

// =============================================
// Bot Schemas
// =============================================

export const createBotSchema = z.object({
  client_id: z.string().uuid(),
  bot_token: z.string().min(40).max(100),
  nowpayments_api_key: z.string().min(10).max(200),
  crypto_wallet_address: z.string().min(20).max(100),
});

export const updateBotSchema = z.object({
  status: z.enum(['ACTIVE', 'PAUSED']).optional(),
  welcome_message: z.string().max(1000).optional(),
  linked_channel_id: z.string().optional(),
  linked_channel_username: z.string().max(50).optional(),
});

export type CreateBotInput = z.infer<typeof createBotSchema>;
export type UpdateBotInput = z.infer<typeof updateBotSchema>;

// =============================================
// Plan Schemas
// =============================================

export const createPlanSchema = z.object({
  plan_type: z.enum(['PLATFORM', 'CLIENT']),
  bot_id: z.string().uuid().optional(),
  name: z.string().min(1).max(50),
  description: z.string().max(500).optional(),
  duration_days: z.number().int().min(1).max(365),
  price_amount: z.number().positive(),
  price_currency: z.string().length(3).toUpperCase().default('USD'),
  max_bots: z.number().int().positive().optional(),
  max_subscribers: z.number().int().positive().optional(),
});

export const updatePlanSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  description: z.string().max(500).optional(),
  is_active: z.boolean().optional(),
  price_amount: z.number().positive().optional(),
});

export type CreatePlanInput = z.infer<typeof createPlanSchema>;
export type UpdatePlanInput = z.infer<typeof updatePlanSchema>;

// =============================================
// Subscriber Schemas
// =============================================

export const updateSubscriberSchema = z.object({
  subscription_status: z.enum(['ACTIVE', 'EXPIRED', 'PENDING_PAYMENT', 'REVOKED']).optional(),
  subscription_end_date: z.string().datetime().optional(),
});

export type UpdateSubscriberInput = z.infer<typeof updateSubscriberSchema>;

// =============================================
// Query Parameter Schemas
// =============================================

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const idParamSchema = z.object({
  id: z.string().uuid(),
});

export type PaginationQuery = z.infer<typeof paginationSchema>;
export type IdParam = z.infer<typeof idParamSchema>;

// =============================================
// Validation Helper
// =============================================

export function validateBody<T>(schema: z.ZodSchema<T>, body: unknown): 
  { success: true; data: T } | { success: false; error: z.ZodError } {
  const result = schema.safeParse(body);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}
