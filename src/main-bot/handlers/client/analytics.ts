/**
 * Client Analytics Handler - Complete Implementation
 */

import { Bot, InlineKeyboard } from 'grammy';
import type { MainBotContext } from '../../../shared/types/index.js';
import { supabase } from '../../../database/index.js';
import { withFooter, formatDate, addDays } from '../../../shared/utils/index.js';
import { clientOnly } from '../../middleware/client.js';

export function setupAnalyticsHandler(bot: Bot<MainBotContext>) {
  bot.callbackQuery('analytics', clientOnly(), async (ctx) => {
    await ctx.answerCallbackQuery();
    await showAnalytics(ctx);
  });

  // Detailed Report
  bot.callbackQuery('analytics_detailed', clientOnly(), async (ctx) => {
    await ctx.answerCallbackQuery();
    await showDetailedReport(ctx);
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

    // Get subscriber IDs for revenue calculation
    const { data: subIds } = await supabase
      .from('subscribers')
      .select('id')
      .in('bot_id', botIds);

    if (subIds && subIds.length > 0) {
      const subscriberIds = subIds.map((s: any) => s.id);
      
      const { data: payments } = await supabase
        .from('payment_transactions')
        .select('amount')
        .in('subscriber_id', subscriberIds)
        .eq('payment_status', 'CONFIRMED');

      totalRevenue = ((payments || []) as Array<{ amount: number }>).reduce((sum, p) => sum + Number(p.amount), 0);
    }
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
    parse_mode: 'HTML',
    reply_markup: keyboard,
  });
}

async function showDetailedReport(ctx: MainBotContext) {
  const client = ctx.client!;

  // Get all bots with subscriber counts
  const { data: botsData } = await supabase
    .from('selling_bots')
    .select('id, bot_username, status')
    .eq('client_id', client.id);

  const bots = botsData as Array<{ id: string; bot_username: string; status: string }> | null;

  if (!bots || bots.length === 0) {
    const keyboard = new InlineKeyboard().text('« Back to Analytics', 'analytics');
    await ctx.reply(withFooter('📊 *Detailed Report*\n\nNo bots found. Create a bot first!'), {
      parse_mode: 'HTML',
      reply_markup: keyboard,
    });
    return;
  }

  let reportMessage = '📊 *Detailed Analytics Report*\n\n';

  for (const bot of bots) {
    const statusEmoji = bot.status === 'ACTIVE' ? '🟢' : '🔴';

    // Get subscriber stats for this bot
    const { count: totalSubs } = await supabase
      .from('subscribers')
      .select('*', { count: 'exact', head: true })
      .eq('bot_id', bot.id);

    const { count: activeSubs } = await supabase
      .from('subscribers')
      .select('*', { count: 'exact', head: true })
      .eq('bot_id', bot.id)
      .eq('subscription_status', 'ACTIVE');

    const { count: expiredSubs } = await supabase
      .from('subscribers')
      .select('*', { count: 'exact', head: true })
      .eq('bot_id', bot.id)
      .eq('subscription_status', 'EXPIRED');

    // Get payments for this bot's subscribers
    const { data: subIds } = await supabase
      .from('subscribers')
      .select('id')
      .eq('bot_id', bot.id);

    let botRevenue = 0;
    let last30DaysRevenue = 0;

    if (subIds && subIds.length > 0) {
      const subscriberIds = subIds.map((s: any) => s.id);

      const { data: allPayments } = await supabase
        .from('payment_transactions')
        .select('amount, confirmed_at')
        .in('subscriber_id', subscriberIds)
        .eq('payment_status', 'CONFIRMED');

      const payments = (allPayments || []) as Array<{ amount: number; confirmed_at: string | null }>;
      botRevenue = payments.reduce((sum, p) => sum + Number(p.amount), 0);

      const thirtyDaysAgo = addDays(new Date(), -30);
      last30DaysRevenue = payments
        .filter((p) => p.confirmed_at && new Date(p.confirmed_at) >= thirtyDaysAgo)
        .reduce((sum, p) => sum + Number(p.amount), 0);
    }

    reportMessage += `${statusEmoji} *@${bot.bot_username}*\n`;
    reportMessage += `   👥 Subscribers: ${totalSubs || 0} (${activeSubs || 0} active, ${expiredSubs || 0} expired)\n`;
    reportMessage += `   💰 Total Revenue: $${botRevenue.toFixed(2)}\n`;
    reportMessage += `   📅 Last 30 Days: $${last30DaysRevenue.toFixed(2)}\n\n`;
  }

  const keyboard = new InlineKeyboard()
    .text('🔄 Refresh', 'analytics_detailed')
    .row()
    .text('« Back to Analytics', 'analytics');

  await ctx.reply(withFooter(reportMessage), {
    parse_mode: 'HTML',
    reply_markup: keyboard,
  });
}
