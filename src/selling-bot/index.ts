/**
 * Selling Bot Entry Point (Supabase version)
 * Subscriber-facing bot for subscription management
 */

import { Bot, session } from 'grammy';
import { conversations } from '@grammyjs/conversations';
import { limit } from '@grammyjs/ratelimiter';
import { sellingBotLogger as logger, decrypt } from '../shared/utils/index.js';
import { createSupabaseStorage } from '../shared/utils/session-storage.js';
import { initSentry } from '../shared/utils/sentry.js';
import type { SellingBotContext, SellingBotSessionData } from '../shared/types/index.js';

// Initialize Sentry
initSentry('selling-bot');
import { supabase, type SellingBot, type Client } from '../database/index.js';

// Import handlers
import { setupStartHandler } from './handlers/onboarding/start.js';
import { setupPlansHandler } from './handlers/onboarding/plans.js';
import { setupPaymentHandler } from './handlers/payment/invoice.js';
import { setupStatusHandler } from './handlers/subscription/status.js';
import { setupHelpHandler } from './handlers/support/help.js';
import { setupJoinRequestHandler } from './handlers/subscription/join-request.js';
import { setupRenewalHandler } from './handlers/subscription/renewal.js';

// Import middleware
import { setupBotConfigMiddleware } from './middleware/bot-config.js';
import { setupSubscriberMiddleware } from './middleware/subscriber.js';

// =================================
// Bot Factory
// =================================

/**
 * Create a selling bot instance for a specific bot configuration
 */
export function createSellingBot(botToken: string, botId: string): Bot<SellingBotContext> {
  logger.info({ botId }, 'Creating selling bot instance');

  const bot = new Bot<SellingBotContext>(botToken);

  // Session setup with persistent storage
  function initialSession(): SellingBotSessionData {
    return {};
  }

  bot.use(session({
    initial: initialSession,
    storage: createSupabaseStorage<SellingBotSessionData>(),
    getSessionKey: (ctx) => ctx.from?.id ? `sell_${botId}_${ctx.from.id}` : undefined,
  }));
  bot.use(conversations());

  // Rate limiting - prevent spam
  bot.use(limit({
    timeFrame: 2000, // 2 seconds
    limit: 3, // 3 messages per timeFrame per user
    onLimitExceeded: async (ctx) => {
      await ctx.reply('⚠️ Too many requests. Please slow down.');
    },
    keyGenerator: (ctx) => ctx.from?.id.toString() ?? 'unknown',
  }));

  // Middleware
  bot.use(setupBotConfigMiddleware(botId));
  bot.use(setupSubscriberMiddleware());

  // Handlers
  setupStartHandler(bot);
  setupPlansHandler(bot);
  setupPaymentHandler(bot);
  setupStatusHandler(bot);
  setupHelpHandler(bot);
  setupJoinRequestHandler(bot);
  setupRenewalHandler(bot);

  // Error handler
  bot.catch((err) => {
    logger.error({ err: err.error, botId }, 'Selling bot error');
  });

  return bot;
}

// =================================
// Bot Manager
// =================================

const activeBots = new Map<string, Bot<SellingBotContext>>();

/**
 * Start all active selling bots
 */
export async function startAllSellingBots(): Promise<void> {
  logger.info('Starting all active selling bots...');

  const { data, error } = await supabase
    .from('selling_bots')
    .select(`
      *,
      clients(status)
    `)
    .eq('status', 'ACTIVE');

  const bots = data as Array<SellingBot & { clients: Pick<Client, 'status'> }> | null;

  if (error || !bots) {
    logger.error({ error }, 'Failed to fetch active bots');
    return;
  }

  for (const botConfig of bots) {
    // Skip if client is not active/trial
    const clientStatus = botConfig.clients?.status;
    if (!['ACTIVE', 'TRIAL'].includes(clientStatus || '')) {
      logger.debug({ botId: botConfig.id }, 'Skipping bot - client not active');
      continue;
    }

    try {
      let token = botConfig.bot_token;
      
      // Decrypt token if it appears to be encrypted
      // Format is IV:AuthTag:Content (3 parts separated by colon)
      if (token && token.includes(':') && token.split(':').length === 3) {
        try {
          token = decrypt(token);
        } catch (e) {
          logger.error({ err: e, botId: botConfig.id }, 'Failed to decrypt bot token');
          continue; 
        }
      }

      const bot = createSellingBot(token, botConfig.id);
      // Start bot non-blocking
      bot.start({
        onStart: (info) => {
          logger.info({ botId: botConfig.id, username: info.username }, 'Selling bot started');
        },
      });
      activeBots.set(botConfig.id, bot);
    } catch (error) {
      logger.error({ error, botId: botConfig.id }, 'Failed to start selling bot');
    }
  }

  logger.info({ count: activeBots.size }, 'Selling bots started');
}

/**
 * Stop a specific bot
 */
export async function stopBot(botId: string): Promise<void> {
  const bot = activeBots.get(botId);
  if (bot) {
    await bot.stop();
    activeBots.delete(botId);
    logger.info({ botId }, 'Selling bot stopped');
  }
}

/**
 * Stop all bots
 */
export async function stopAllBots(): Promise<void> {
  for (const [botId, bot] of activeBots) {
    await bot.stop();
    logger.info({ botId }, 'Selling bot stopped');
  }
  activeBots.clear();
}

// =================================
// Standalone Mode
// =================================

// If running as standalone, start all bots
if (process.argv[1] && process.argv[1].includes('selling-bot')) {
  startAllSellingBots().catch((error) => {
    logger.fatal({ error }, 'Failed to start selling bots');
    process.exit(1);
  });
}

export default { createSellingBot, startAllSellingBots, stopBot, stopAllBots };
