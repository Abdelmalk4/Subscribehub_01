/**
 * Main Bot Entry Point
 * Control plane for platform administration and client management
 */

import { Bot, session } from 'grammy';
import { conversations, createConversation } from '@grammyjs/conversations';
import { limit } from '@grammyjs/ratelimiter';
import { config } from '../shared/config/index.js';
import { mainBotLogger as logger } from '../shared/utils/index.js';
import { createSupabaseStorage } from '../shared/utils/session-storage.js';
import { initSentry } from '../shared/utils/sentry.js';
import type { MainBotContext, MainBotSessionData } from '../shared/types/index.js';

// Initialize Sentry
initSentry('main-bot');

// Import middleware
import { setupAdminMiddleware } from './middleware/admin.js';
import { setupClientMiddleware } from './middleware/client.js';

// Import handlers
import { setupStartCommand } from './handlers/common/start.js';
import { setupHelpCommand } from './handlers/common/help.js';
import { setupAdminHandlers } from './handlers/admin/index.js';
import { setupMyBotsHandler } from './handlers/client/my-bots.js';
import { setupSubscriptionHandler } from './handlers/client/subscription.js';
import { setupSettingsHandler } from './handlers/client/settings.js';
import { setupAnalyticsHandler } from './handlers/client/analytics.js';

// Import conversations
import { registrationConversation } from './handlers/client/registration.js';
import { botCreationConversation } from './handlers/client/bot-creation.js';
import { planCreationConversation } from './handlers/client/plan-creation.js';
import { adminPlanCreationConversation } from './handlers/admin/plan-creation.js';

// Import selling bot manager
import { startAllSellingBots, stopAllBots } from '../selling-bot/index.js';

// =================================
// Bot Initialization
// =================================

logger.info('Initializing Main Bot...');

export const mainBot = new Bot<MainBotContext>(config.MAIN_BOT_TOKEN);

// =================================
// Session Setup
// =================================

function initialSession(): MainBotSessionData {
  return {};
}

// Use persistent storage (survives restarts)
mainBot.use(session({
  initial: initialSession,
  storage: createSupabaseStorage<MainBotSessionData>(),
  getSessionKey: (ctx) => ctx.from?.id ? `main_${ctx.from.id}` : undefined,
}));

// =================================
// Rate Limiting
// =================================

mainBot.use(limit({
  timeFrame: 2000, // 2 seconds
  limit: 3, // 3 messages per timeFrame per user
  onLimitExceeded: async (ctx) => {
    await ctx.reply('⚠️ Too many requests. Please slow down.');
  },
  keyGenerator: (ctx) => ctx.from?.id.toString() ?? 'unknown',
}));

// =================================
// Conversations Plugin
// =================================

mainBot.use(conversations());
mainBot.use(createConversation(registrationConversation));
mainBot.use(createConversation(botCreationConversation));
mainBot.use(createConversation(planCreationConversation));
mainBot.use(createConversation(adminPlanCreationConversation));

// =================================
// Middleware
// =================================

mainBot.use(setupAdminMiddleware());
mainBot.use(setupClientMiddleware());

// =================================
// Command & Callback Handlers
// =================================

setupStartCommand(mainBot);
setupHelpCommand(mainBot);
setupAdminHandlers(mainBot);
setupMyBotsHandler(mainBot);
setupSubscriptionHandler(mainBot);
setupSettingsHandler(mainBot);
setupAnalyticsHandler(mainBot);

// Register callback
mainBot.callbackQuery('register', async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.conversation.enter('registrationConversation');
});

// =================================
// Error Handler
// =================================

mainBot.catch((err) => {
  logger.error({ err: err.error, ctx: err.ctx.update }, 'Main Bot error');
});

// =================================
// Graceful Shutdown
// =================================

async function shutdown(signal: string) {
  logger.info({ signal }, 'Received shutdown signal, stopping bots...');
  
  try {
    await stopAllBots();
    mainBot.stop();
    logger.info('All bots stopped gracefully');
    process.exit(0);
  } catch (error) {
    logger.error({ error }, 'Error during shutdown');
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// =================================
// Start Bot
// =================================

async function startBot() {
  try {
    const me = await mainBot.api.getMe();
    logger.info({ username: me.username, id: me.id }, 'Main Bot connected');

    // Start Main Bot
    mainBot.start({
      onStart: (botInfo) => {
        logger.info({ botInfo }, 'Main Bot started polling');
      },
    });
    
    // Start Selling Bots Manager (non-blocking)
    startAllSellingBots().catch(error => {
      logger.error({ error }, 'Failed to start selling bots');
    });
    
  } catch (error) {
    logger.fatal({ error }, 'Failed to start Main Bot');
    process.exit(1);
  }
}

startBot();

export default mainBot;
