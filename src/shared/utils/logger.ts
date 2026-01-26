/**
 * Logger Utility
 * Structured logging with Pino
 */

import { pino } from 'pino';
import { config, isDevelopment } from '../config/index.js';

export const logger = pino({
  level: config.LOG_LEVEL,
  transport: isDevelopment
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
  base: {
    service: 'teletrade',
  },
});

// Create child loggers for different components
export const createLogger = (component: string) => {
  return logger.child({ component });
};

// Pre-configured loggers
export const mainBotLogger = createLogger('main-bot');
export const sellingBotLogger = createLogger('selling-bot');
export const paymentLogger = createLogger('payment');
export const accessLogger = createLogger('access-control');
export const webhookLogger = createLogger('webhook');
export const cronLogger = createLogger('cron');
