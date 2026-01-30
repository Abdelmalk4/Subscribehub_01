/**
 * Sentry Configuration
 * Centralized error monitoring setup
 */

import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import { config, isProduction } from '../config/index.js';
import { createLogger } from './logger.js';

const logger = createLogger('sentry');

export function initSentry(serviceName: string) {
  if (!config.SENTRY_DSN) {
    logger.debug('Sentry DSN not found, skipping initialization');
    return;
  }
  
  try {
    Sentry.init({
      dsn: config.SENTRY_DSN,
      integrations: [
        nodeProfilingIntegration(),
      ],
      // Performance Monitoring
      tracesSampleRate: isProduction ? 0.1 : 1.0, // Capture 100% of transactions in dev, 10% in prod
      
      // Profiling
      profilesSampleRate: 1.0, // Profiling sample rate is relative to tracesSampleRate
      
      environment: isProduction ? 'production' : 'development',
      serverName: serviceName,
    });
    
    logger.info({ serviceName }, 'Sentry initialized');
  } catch (error) {
    logger.error({ error }, 'Failed to initialize Sentry');
  }
}
