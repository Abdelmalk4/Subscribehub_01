/**
 * Client API Routes (Supabase version)
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { supabase, type Client, type SellingBot, type Subscriber } from '../../../database/index.js';
import { createLogger } from '../../../shared/utils/logger.js';

const logger = createLogger('api-clients');

export function registerClientRoutes(app: FastifyInstance): void {
  // Get all clients
  app.get('/clients', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { data } = await supabase
        .from('clients')
        .select('*, selling_bots(count)')
        .order('created_at', { ascending: false });

      return { clients: data };
    } catch (error) {
      logger.error({ error }, 'Failed to get clients');
      return reply.status(500).send({ error: 'Failed to get clients' });
    }
  });

  // Get client by ID
  app.get<{ Params: { id: string } }>('/clients/:id', async (request, reply) => {
    try {
      const { data } = await supabase
        .from('clients')
        .select('*, selling_bots(*), subscription_plans(*)')
        .eq('id', request.params.id)
        .single();

      if (!data) {
        return reply.status(404).send({ error: 'Client not found' });
      }

      return { client: data };
    } catch (error) {
      logger.error({ error }, 'Failed to get client');
      return reply.status(500).send({ error: 'Failed to get client' });
    }
  });

  // Approve client
  app.post<{ Params: { id: string } }>('/clients/:id/approve', async (request, reply) => {
    try {
      const { data, error } = await (supabase
        .from('clients') as any)
        .update({ status: 'PENDING' })
        .eq('id', request.params.id)
        .select()
        .single();

      if (error) throw error;

      const client = data as Client;

      logger.info({ clientId: client.id }, 'Client approved');
      return { success: true, client };
    } catch (error) {
      logger.error({ error }, 'Failed to approve client');
      return reply.status(500).send({ error: 'Failed to approve client' });
    }
  });

  // Suspend client
  app.post<{ Params: { id: string }; Body: { reason?: string } }>(
    '/clients/:id/suspend',
    async (request, reply) => {
      try {
        await (supabase
          .from('clients') as any)
          .update({ status: 'SUSPENDED' })
          .eq('id', request.params.id);

        await (supabase
          .from('selling_bots') as any)
          .update({ status: 'PAUSED' })
          .eq('client_id', request.params.id);

        logger.info({ clientId: request.params.id }, 'Client suspended');
        return { success: true };
      } catch (error) {
        logger.error({ error }, 'Failed to suspend client');
        return reply.status(500).send({ error: 'Failed to suspend client' });
      }
    }
  );

  // Get platform stats
  app.get('/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const [clientsRes, botsRes, subsRes] = await Promise.all([
        supabase.from('clients').select('status'),
        supabase.from('selling_bots').select('status'),
        supabase.from('subscribers').select('subscription_status'),
      ]);

      const clientData = (clientsRes.data || []) as Array<Pick<Client, 'status'>>;
      const botData = (botsRes.data || []) as Array<Pick<SellingBot, 'status'>>;
      const subData = (subsRes.data || []) as Array<Pick<Subscriber, 'subscription_status'>>;

      return {
        clients: {
          total: clientData.length,
          active: clientData.filter((c) => c.status === 'ACTIVE').length,
          trial: clientData.filter((c) => c.status === 'TRIAL').length,
        },
        bots: {
          total: botData.length,
          active: botData.filter((b) => b.status === 'ACTIVE').length,
        },
        subscribers: {
          total: subData.length,
          active: subData.filter((s) => s.subscription_status === 'ACTIVE').length,
        },
      };
    } catch (error) {
      logger.error({ error }, 'Failed to get stats');
      return reply.status(500).send({ error: 'Failed to get stats' });
    }
  });
}
