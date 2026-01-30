/**
 * Backend Entry Point
 * Core API server with webhooks and scheduled jobs
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { config, isDevelopment, isProduction } from '../shared/config/index.js';
import { createLogger } from '../shared/utils/logger.js';
import { initSentry } from '../shared/utils/sentry.js';

initSentry('backend-api');

// Import routes
import { registerWebhookRoutes } from './webhooks/nowpayments/handler.js';
import { registerApiRoutes } from './api/index.js';

// Import jobs
import { startScheduledJobs } from './jobs/index.js';

const logger = createLogger('backend');

// Import auth middleware
import { authenticateApi } from './middleware/api-auth.js';
import { supabase } from '../database/index.js';

// Create Fastify instance
const app = Fastify({
  logger: isDevelopment,
});

// CORS Configuration
// Warn if wildcard in production
if (isProduction && config.ALLOWED_ORIGINS.includes('*')) {
  logger.warn('CORS wildcard (*) is enabled in production. This is a security risk.');
}

await app.register(cors, {
   origin: config.ALLOWED_ORIGINS,
   credentials: true,
   methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
});

// Rate Limiting - protect against abuse
await app.register(rateLimit, {
  max: 100, // 100 requests per minute per IP
  timeWindow: '1 minute',
  errorResponseBuilder: (_request, context) => ({
    error: 'Too Many Requests',
    message: `Rate limit exceeded. Try again in ${Math.ceil(context.ttl / 1000)} seconds.`,
    statusCode: 429,
  }),
  // Skip rate limiting for webhooks (they have their own validation)
  allowList: (request) => request.url.startsWith('/webhooks/'),
});

// Register global auth hook
app.addHook('onRequest', authenticateApi);

// Health check
app.get('/health', async (request, reply) => {
  try {
    // Check DB connection
    const { error } = await supabase.from('clients').select('id').limit(1);
    if (error) throw error;
    
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: 'connected'
    };
  } catch (error) {
    logger.error({ error }, 'Health check failed');
    return reply.status(503).send({
      status: 'error',
      timestamp: new Date().toISOString(),
      database: 'disconnected'
    });
  }
});

// Register routes
registerWebhookRoutes(app);
registerApiRoutes(app);

// Graceful shutdown handler
async function shutdown(signal: string) {
  logger.info({ signal }, 'Received shutdown signal, closing server...');
  
  try {
    await app.close();
    logger.info('Server closed gracefully');
    process.exit(0);
  } catch (error) {
    logger.error({ error }, 'Error during shutdown');
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Start server
async function start() {
  try {
    const port = parseInt(process.env.PORT || '3000');
    const host = '0.0.0.0';

    await app.listen({ port, host });
    logger.info({ port, host }, 'Backend server started');

    // Start scheduled jobs
    startScheduledJobs();
    logger.info('Scheduled jobs started');

  } catch (error) {
    logger.fatal({ error }, 'Failed to start backend');
    process.exit(1);
  }
}

start();

export default app;
