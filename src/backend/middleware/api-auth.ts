/**
 * API Authentication Middleware
 * Validates the x-api-key header for API routes
 */

import { FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../../shared/config/index.js';
import { createLogger } from '../../shared/utils/logger.js';

const logger = createLogger('api-auth');

export async function authenticateApi(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Skip auth for health check and webhooks (webhooks have their own signature validation)
  if (
    request.url === '/health' ||
    request.url.startsWith('/webhooks/')
  ) {
    return;
  }

  const apiKey = request.headers['x-api-key'];

  if (!apiKey || apiKey !== config.ADMIN_API_KEY) {
    logger.warn(
      { 
        ip: request.ip, 
        path: request.url,
        userAgent: request.headers['user-agent'] 
      }, 
      'Unauthorized API access attempt'
    );
    
    await reply.status(401).send({ 
      error: 'Unauthorized',
      message: 'Invalid or missing API key'
    });
  }
}
