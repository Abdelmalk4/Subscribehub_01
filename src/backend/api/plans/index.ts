/**
 * Plan API Routes (Supabase version)
 */

import { FastifyInstance } from 'fastify';
import { supabase, type SubscriptionPlan } from '../../../database/index.js';
import { createLogger } from '../../../shared/utils/logger.js';

const logger = createLogger('api-plans');

export function registerPlanRoutes(app: FastifyInstance): void {
  // Get all plans
  app.get<{ Querystring: { botId?: string; type?: 'PLATFORM' | 'CLIENT' } }>(
    '/plans',
    async (request, reply) => {
      try {
        let query = supabase.from('subscription_plans').select('*');

        if (request.query.botId) {
          query = query.eq('bot_id', request.query.botId);
        }
        if (request.query.type) {
          query = query.eq('plan_type', request.query.type);
        }

        const { data } = await query.order('price_amount', { ascending: true });
        return { plans: data };
      } catch (error) {
        logger.error({ error }, 'Failed to get plans');
        return reply.status(500).send({ error: 'Failed to get plans' });
      }
    }
  );

  // Create plan
  app.post<{
    Body: {
      botId?: string;
      planType: 'PLATFORM' | 'CLIENT';
      name: string;
      description?: string;
      durationDays: number;
      priceAmount: number;
      priceCurrency: string;
      maxBots?: number;
      maxSubscribers?: number;
    };
  }>('/plans', async (request, reply) => {
    try {
      const { data, error } = await (supabase
        .from('subscription_plans') as any)
        .insert({
          bot_id: request.body.botId,
          plan_type: request.body.planType,
          name: request.body.name,
          description: request.body.description,
          duration_days: request.body.durationDays,
          price_amount: request.body.priceAmount,
          price_currency: request.body.priceCurrency.toUpperCase(),
          max_bots: request.body.maxBots,
          max_subscribers: request.body.maxSubscribers,
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;

      const plan = data as SubscriptionPlan;

      logger.info({ planId: plan.id, name: plan.name }, 'Plan created');
      return { plan };
    } catch (error) {
      logger.error({ error }, 'Failed to create plan');
      return reply.status(500).send({ error: 'Failed to create plan' });
    }
  });

  // Update plan
  app.patch<{
    Params: { id: string };
    Body: {
      name?: string;
      description?: string;
      priceAmount?: number;
      priceCurrency?: string;
      isActive?: boolean;
    };
  }>('/plans/:id', async (request, reply) => {
    try {
      const updateData: any = {};
      if (request.body.name) updateData.name = request.body.name;
      if (request.body.description !== undefined) updateData.description = request.body.description;
      if (request.body.priceAmount) updateData.price_amount = request.body.priceAmount;
      if (request.body.priceCurrency) updateData.price_currency = request.body.priceCurrency;
      if (request.body.isActive !== undefined) updateData.is_active = request.body.isActive;

      const { data, error } = await (supabase
        .from('subscription_plans') as any)
        .update(updateData)
        .eq('id', request.params.id)
        .select()
        .single();

      if (error) throw error;

      const plan = data as SubscriptionPlan;

      logger.info({ planId: plan.id }, 'Plan updated');
      return { plan };
    } catch (error) {
      logger.error({ error }, 'Failed to update plan');
      return reply.status(500).send({ error: 'Failed to update plan' });
    }
  });

  // Delete plan (soft delete)
  app.delete<{ Params: { id: string } }>('/plans/:id', async (request, reply) => {
    try {
      await (supabase
        .from('subscription_plans') as any)
        .update({ is_active: false })
        .eq('id', request.params.id);

      logger.info({ planId: request.params.id }, 'Plan deactivated');
      return { success: true };
    } catch (error) {
      logger.error({ error }, 'Failed to delete plan');
      return reply.status(500).send({ error: 'Failed to delete plan' });
    }
  });
}
