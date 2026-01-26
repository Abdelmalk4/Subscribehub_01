/**
 * Client Analytics Handler
 */

import { Bot, InlineKeyboard } from 'grammy';
import type { MainBotContext } from '../../../shared/types/index.js';
import { supabase } from '../../../database/index.js';
import { withFooter, formatPrice } from '../../../shared/utils/index.js';
import { clientOnly } from '../../middleware/client.js';

export function setupAnalyticsHandler(bot: Bot<MainBotContext>) {
  bot.callbackQuery('analytics', clientOnly(), async (ctx) => {
    await ctx.answerCallbackQuery();
    await showAnalytics(ctx);
  });
}

async function showAnalytics(ctx: MainBotContext) {
  const client = ctx.client!;

  // Get bot IDs for this client
  const { data: botData } = await supabase
    .from('selling_bots')
    .select('id, status')
    .eq('client_id', client.id);

  const bots = botData as Array<{ id: string; status: string }> | null;
  const botIds = bots?.map((b) => b.id) || [];

  const totalBots = bots?.length || 0;
  const activeBots = bots?.filter((b) => b.status === 'ACTIVE').length || 0;

  let totalSubscribers = 0;
  let activeSubscribers = 0;
  let totalRevenue = 0;

  if (botIds.length > 0) {
    // Get subscriber counts
    const { count: totalSubs } = await supabase
      .from('subscribers')
      .select('*', { count: 'exact', head: true })
      .in('bot_id', botIds);

    const { count: activeSubs } = await supabase
      .from('subscribers')
      .select('*', { count: 'exact', head: true })
      .in('bot_id', botIds)
      .eq('subscription_status', 'ACTIVE');

    totalSubscribers = totalSubs || 0;
    activeSubscribers = activeSubs || 0;

    // Get revenue (confirmed payments)
    const { data: payments } = await supabase
      .from('payment_transactions')
      .select('amount')
      .in('subscriber_id', (
        await supabase
          .from('subscribers')
          .select('id')
          .in('bot_id', botIds)
      ).data?.map((s: any) => s.id) || [])
      .eq('payment_status', 'CONFIRMED');

    totalRevenue = ((payments || []) as Array<{ amount: number }>).reduce((sum, p) => sum + Number(p.amount), 0);
  }

  const keyboard = new InlineKeyboard()
    .text('🔄 Refresh', 'analytics')
    .row()
    .text('📊 Detailed Report', 'analytics_detailed')
    .row()
    .text('« Back', 'start');

  await ctx.reply(withFooter(`
📊 *Your Analytics*

*Bots:*
• Total: ${totalBots}
• Active: ${activeBots}

*Subscribers:*
• Total: ${totalSubscribers}
• Active: ${activeSubscribers}

*Revenue:*
• Total: $${totalRevenue.toFixed(2)} USD

_Last updated: Just now_
  `), {
    parse_mode: 'Markdown',
    reply_markup: keyboard,
  });
}
