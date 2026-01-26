/**
 * Main Bot Entry Point
 * Control plane for platform administration and client management
 */

import { Bot, session } from 'grammy';
import { conversations, createConversation } from '@grammyjs/conversations';
import { config } from '../shared/config/index.js';
import { mainBotLogger as logger } from '../shared/utils/index.js';
import type { MainBotContext, MainBotSessionData } from '../shared/types/index.js';

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

mainBot.use(session({ initial: initialSession }));

// =================================
// Conversations Plugin
// =================================

mainBot.use(conversations());
mainBot.use(createConversation(registrationConversation));
mainBot.use(createConversation(botCreationConversation));
mainBot.use(createConversation(planCreationConversation));

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
// Start Bot
// =================================

async function startBot() {
  try {
    const me = await mainBot.api.getMe();
    logger.info({ username: me.username, id: me.id }, 'Main Bot connected');

    await mainBot.start({
      onStart: (botInfo) => {
        logger.info({ botInfo }, 'Main Bot started polling');
      },
    });
  } catch (error) {
    logger.fatal({ error }, 'Failed to start Main Bot');
    process.exit(1);
  }
}

startBot();

export default mainBot;
