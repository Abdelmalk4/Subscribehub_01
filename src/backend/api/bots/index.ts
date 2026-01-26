/**
 * Bot API Routes (Supabase version)
 */

import { FastifyInstance } from 'fastify';
import { supabase, type SellingBot, type Client, type SubscriptionPlan, type Subscriber } from '../../../database/index.js';
import { createLogger } from '../../../shared/utils/logger.js';

const logger = createLogger('api-bots');

export function registerBotRoutes(app: FastifyInstance): void {
  // Get bots
  app.get<{ Querystring: { clientId?: string } }>('/bots', async (request, reply) => {
    try {
      let query = supabase.from('selling_bots').select('*, clients(business_name, status)');

      if (request.query.clientId) {
        query = query.eq('client_id', request.query.clientId);
      }

      const { data } = await query.order('created_at', { ascending: false });
      return { bots: data };
    } catch (error) {
      logger.error({ error }, 'Failed to get bots');
      return reply.status(500).send({ error: 'Failed to get bots' });
    }
  });

  // Get bot by ID
  app.get<{ Params: { id: string } }>('/bots/:id', async (request, reply) => {
    try {
      const { data } = await supabase
        .from('selling_bots')
        .select('*, subscription_plans(*)')
        .eq('id', request.params.id)
        .single();

      const bot = data as (SellingBot & { subscription_plans: SubscriptionPlan[] }) | null;

      if (!bot) {
        return reply.status(404).send({ error: 'Bot not found' });
      }

      return { bot };
    } catch (error) {
      logger.error({ error }, 'Failed to get bot');
      return reply.status(500).send({ error: 'Failed to get bot' });
    }
  });

  // Pause bot
  app.post<{ Params: { id: string } }>('/bots/:id/pause', async (request, reply) => {
    try {
      const { data } = await (supabase
        .from('selling_bots') as any)
        .update({ status: 'PAUSED' })
        .eq('id', request.params.id)
        .select()
        .single();

      const bot = data as SellingBot | null;

      logger.info({ botId: bot?.id }, 'Bot paused');
      return { success: true, bot };
    } catch (error) {
      logger.error({ error }, 'Failed to pause bot');
      return reply.status(500).send({ error: 'Failed to pause bot' });
    }
  });

  // Activate bot
  app.post<{ Params: { id: string } }>('/bots/:id/activate', async (request, reply) => {
    try {
      const { data } = await (supabase
        .from('selling_bots') as any)
        .update({ status: 'ACTIVE' })
        .eq('id', request.params.id)
        .select()
        .single();

      const bot = data as SellingBot | null;

      logger.info({ botId: bot?.id }, 'Bot activated');
      return { success: true, bot };
    } catch (error) {
      logger.error({ error }, 'Failed to activate bot');
      return reply.status(500).send({ error: 'Failed to activate bot' });
    }
  });

  // Get bot subscribers
  app.get<{ Params: { id: string }; Querystring: { status?: string } }>(
    '/bots/:id/subscribers',
    async (request, reply) => {
      try {
        let query = supabase
          .from('subscribers')
          .select('*, subscription_plans(name, duration_days)')
          .eq('bot_id', request.params.id);

        if (request.query.status) {
          query = query.eq('subscription_status', request.query.status);
        }

        const { data } = await query.order('created_at', { ascending: false });
        return { subscribers: data };
      } catch (error) {
        logger.error({ error }, 'Failed to get subscribers');
        return reply.status(500).send({ error: 'Failed to get subscribers' });
      }
    }
  );
}
