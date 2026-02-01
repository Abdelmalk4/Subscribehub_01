/**
 * Admin Handlers - Platform Administration (Supabase version)
 */

import { Bot, InlineKeyboard } from 'grammy';
import type { MainBotContext } from '../../../shared/types/index.js';
import { supabase, type Client, type SellingBot, type SubscriptionPlan, type Subscriber, type PaymentTransaction } from '../../../database/index.js';
import { mainBotLogger as logger, withFooter, formatDate, escapeHtml } from '../../../shared/utils/index.js';
import { config } from '../../../shared/config/index.js';
import { adminOnly } from '../../middleware/admin.js';

export function setupAdminHandlers(bot: Bot<MainBotContext>) {
  // Admin clients list
  bot.callbackQuery('admin_clients', adminOnly(), async (ctx) => {
    await ctx.answerCallbackQuery();
    await showClientsList(ctx);
  });

  // Pending approvals
  bot.callbackQuery('admin_pending', adminOnly(), async (ctx) => {
    await ctx.answerCallbackQuery();
    await showPendingApprovals(ctx);
  });

  // Platform stats
  bot.callbackQuery('admin_stats', adminOnly(), async (ctx) => {
    await ctx.answerCallbackQuery();
    await showPlatformStats(ctx);
  });

  // Platform settings
  bot.callbackQuery('admin_settings', adminOnly(), async (ctx) => {
    await ctx.answerCallbackQuery();
    const keyboard = new InlineKeyboard()
      .text('📋 Manage Platform Plans', 'admin_manage_plans')
      .row()
      .text('🔔 IPN Settings', 'admin_ipn_settings')
      .row()
      .text('« Back', 'start');

    await ctx.reply(withFooter(`
⚙️ <b>Platform Settings</b>

Configure your SubscribeHub platform.

• <b>Platform Plans</b> - Manage subscription plans for clients
• <b>IPN Settings</b> - NOWPayments webhook configuration
    `), { parse_mode: 'HTML', reply_markup: keyboard });
  });

  // Manage Platform Plans
  bot.callbackQuery('admin_manage_plans', adminOnly(), async (ctx) => {
    await ctx.answerCallbackQuery();
    
    const { data } = await supabase
      .from('subscription_plans')
      .select('*')
      .eq('plan_type', 'PLATFORM')
      .order('price_amount', { ascending: true });

    const plans = data as SubscriptionPlan[] | null;
    
    const keyboard = new InlineKeyboard()
      .text('➕ Create Platform Plan', 'admin_create_platform_plan')
      .row();
    
    if (plans && plans.length > 0) {
      for (const plan of plans) {
        const status = plan.is_active ? '✅' : '❌';
        keyboard.text(`${status} ${plan.name}`, `admin_edit_plan:${plan.id}`).row();
      }
    }
    
    keyboard.text('« Back to Settings', 'admin_settings');

    const planList = plans && plans.length > 0
      ? plans.map(p => `• <b>${escapeHtml(p.name)}</b> - $${p.price_amount} / ${p.duration_days} days ${p.is_active ? '✅' : '❌'}`).join('\n')
      : '<i>No platform plans created yet.</i>';

    await ctx.reply(withFooter(`
📋 <b>Platform Subscription Plans</b>

These plans are offered to clients for platform access.

${planList}
    `), { parse_mode: 'HTML', reply_markup: keyboard });
  });

  // Create Platform Plan
  bot.callbackQuery('admin_create_platform_plan', adminOnly(), async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.conversation.enter('adminPlanCreationConversation');
  });

  // IPN Settings
  bot.callbackQuery('admin_ipn_settings', adminOnly(), async (ctx) => {
    await ctx.answerCallbackQuery();
    
    const keyboard = new InlineKeyboard()
      .text('📋 Copy IPN URL', 'admin_copy_ipn_url')
      .row()
      .text('« Back to Settings', 'admin_settings');

    const ipnUrl = config.NOWPAYMENTS_IPN_CALLBACK_URL || 'Not configured';
    const ipnSecret = config.NOWPAYMENTS_IPN_SECRET ? '✅ Configured' : '❌ Not set';

    await ctx.reply(withFooter(`
🔔 <b>IPN Settings</b>

Configure NOWPayments webhook notifications.

<b>IPN Callback URL:</b>
<code>${ipnUrl}</code>

<b>IPN Secret:</b> ${ipnSecret}

<b>Setup Instructions:</b>
1. Go to NOWPayments dashboard
2. Navigate to Settings → IPN
3. Set the callback URL above
4. Copy the IPN secret to your .env file
    `), { parse_mode: 'HTML', reply_markup: keyboard });
  });

  // Admin search client
  bot.callbackQuery('admin_search', adminOnly(), async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(withFooter(`
🔍 <b>Search Client</b>

Send the client's username or business name to search.

<i>Example: @username or "Premium Signals"</i>
    `), { parse_mode: 'HTML' });
  });

  // Approve client
  bot.callbackQuery(/^approve_client:(.+)$/, adminOnly(), async (ctx) => {
    const clientId = ctx.match[1];
    await ctx.answerCallbackQuery('Approving...');
    await approveClient(ctx, clientId);
  });

  // Suspend client
  bot.callbackQuery(/^suspend_client:(.+)$/, adminOnly(), async (ctx) => {
    const clientId = ctx.match[1];
    await ctx.answerCallbackQuery();
    await showSuspendConfirm(ctx, clientId);
  });

  // View client details
  bot.callbackQuery(/^view_client:(.+)$/, adminOnly(), async (ctx) => {
    const clientId = ctx.match[1];
    await ctx.answerCallbackQuery();
    await showClientDetails(ctx, clientId);
  });
}

async function showClientsList(ctx: MainBotContext) {
  const { data, error } = await supabase
    .from('clients')
    .select(`
      *,
      selling_bots(count)
    `)
    .order('created_at', { ascending: false })
    .limit(10);

  const clients = data as Array<Client & { selling_bots: Array<{ count: number }> }> | null;

  if (error || !clients || clients.length === 0) {
    await ctx.reply('📭 No clients registered yet.');
    return;
  }

  const keyboard = new InlineKeyboard();

  for (const client of clients) {
    const statusEmoji = getStatusEmoji(client.status);
    const botCount = client.selling_bots?.[0]?.count || 0;
    keyboard.text(
      `${statusEmoji} ${client.business_name} (${botCount} bots)`,
      `view_client:${client.id}`
    ).row();
  }

  keyboard.text('« Back to Dashboard', 'start');

  await ctx.reply(
    withFooter('👥 <b>All Clients</b>\n\nSelect a client to view details:'),
    {
      parse_mode: 'HTML',
      reply_markup: keyboard,
    }
  );
}

async function showPendingApprovals(ctx: MainBotContext) {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('status', 'PENDING')
    .order('created_at', { ascending: true });

  const pending = data as Client[] | null;

  if (error || !pending || pending.length === 0) {
    const keyboard = new InlineKeyboard().text('« Back', 'start');
    await ctx.reply(
      withFooter('✅ No pending approvals!'),
      { parse_mode: 'HTML', reply_markup: keyboard }
    );
    return;
  }

  const keyboard = new InlineKeyboard();

  for (const client of pending) {
    keyboard.text(
      `📋 ${client.business_name}`,
      `view_client:${client.id}`
    ).row();
  }

  keyboard.text('« Back', 'start');

  await ctx.reply(
    withFooter(`📋 <b>Pending Approvals (${pending.length})</b>\n\nReview and approve new clients:`),
    {
      parse_mode: 'HTML',
      reply_markup: keyboard,
    }
  );
}

async function showPlatformStats(ctx: MainBotContext) {
  const [
    totalClientsRes,
    activeClientsRes,
    trialClientsRes,
    pendingClientsRes,
    totalBotsRes,
    activeBotsRes,
    totalSubscribersRes,
    activeSubscribersRes,
    todayPaymentsRes,
  ] = await Promise.all([
    supabase.from('clients').select('*', { count: 'exact', head: true }),
    supabase.from('clients').select('*', { count: 'exact', head: true }).eq('status', 'ACTIVE'),
    supabase.from('clients').select('*', { count: 'exact', head: true }).eq('status', 'TRIAL'),
    supabase.from('clients').select('*', { count: 'exact', head: true }).eq('status', 'PENDING'),
    supabase.from('selling_bots').select('*', { count: 'exact', head: true }),
    supabase.from('selling_bots').select('*', { count: 'exact', head: true }).eq('status', 'ACTIVE'),
    supabase.from('subscribers').select('*', { count: 'exact', head: true }),
    supabase.from('subscribers').select('*', { count: 'exact', head: true }).eq('subscription_status', 'ACTIVE'),
    supabase.from('payment_transactions').select('*', { count: 'exact', head: true })
      .eq('payment_status', 'CONFIRMED')
      .gte('confirmed_at', new Date(new Date().setHours(0, 0, 0, 0)).toISOString()),
  ]);

  const totalClients = totalClientsRes.count;
  const activeClients = activeClientsRes.count;
  const trialClients = trialClientsRes.count;
  const pendingClients = pendingClientsRes.count;
  const totalBots = totalBotsRes.count;
  const activeBots = activeBotsRes.count;
  const totalSubscribers = totalSubscribersRes.count;
  const activeSubscribers = activeSubscribersRes.count;
  const todayPayments = todayPaymentsRes.count;

  const keyboard = new InlineKeyboard()
    .text('🔄 Refresh', 'admin_stats')
    .text('« Back', 'start');

  const message = `
📈 <b>Platform Statistics</b>

<b>Clients:</b>
• Total: ${totalClients || 0}
• Active: ${activeClients || 0}
• Trial: ${trialClients || 0}
• Pending: ${pendingClients || 0}

<b>Selling Bots:</b>
• Total: ${totalBots || 0}
• Active: ${activeBots || 0}

<b>Subscribers:</b>
• Total: ${totalSubscribers || 0}
• Active: ${activeSubscribers || 0}

<b>Today's Payments:</b> ${todayPayments || 0}
`;

  await ctx.reply(withFooter(message), {
    parse_mode: 'HTML',
    reply_markup: keyboard,
  });
}

async function showClientDetails(ctx: MainBotContext, clientId: string) {
  const { data, error } = await supabase
    .from('clients')
    .select('*, selling_bots(id, bot_username, status, linked_channel_username, linked_channel_id), subscription_plans(*)')
    .eq('id', clientId)
    .single();

  const client = data as (Client & { selling_bots: SellingBot[]; subscription_plans: SubscriptionPlan[] }) | null;

  if (error || !client) {
    await ctx.reply('❌ Client not found');
    return;
  }

  const keyboard = new InlineKeyboard();

  if (client.status === 'PENDING') {
    keyboard.text('✅ Approve', `approve_client:${client.id}`);
  }
  if (client.status !== 'SUSPENDED') {
    keyboard.text('🚫 Suspend', `suspend_client:${client.id}`);
  }
  keyboard.row().text('« Back to Clients', 'admin_clients');

  const botsInfo = client.selling_bots && client.selling_bots.length > 0
    ? client.selling_bots.map((b) => {
        const linked = b.linked_channel_username 
          ? `\n    └ Linked: @${escapeHtml(b.linked_channel_username)}`
          : b.linked_channel_id 
            ? `\n    └ Linked ID: ${b.linked_channel_id}`
            : '\n    └ ⚠️ Not Linked';
            
        return `  • @${escapeHtml(b.bot_username || 'Unknown')} (${b.status})${linked}`;
      }).join('\n')
    : '  None';

  const message = `
👤 <b>Client Details</b>

<b>Business:</b> ${escapeHtml(client.business_name)}
<b>Status:</b> ${getStatusEmoji(client.status)} ${client.status}
<b>Channel:</b> @${escapeHtml(client.channel_username || 'Not set')}
<b>Email:</b> ${escapeHtml(client.contact_email || 'Not provided')}
<b>Registered:</b> ${formatDate(new Date(client.created_at))}

<b>Trial:</b>
${client.trial_activated
    ? `Started: ${formatDate(new Date(client.trial_start_date!))}\nEnds: ${formatDate(new Date(client.trial_end_date!))}`
    : 'Not started'}

<b>Selling Bots (${client.selling_bots?.length || 0}):</b>
${botsInfo}
`;

  await ctx.reply(withFooter(message), {
    parse_mode: 'HTML',
    reply_markup: keyboard,
  });
}

async function approveClient(ctx: MainBotContext, clientId: string) {
  try {
    const { data: clientData, error } = await (supabase
      .from('clients') as any)
      .update({ status: 'ACTIVE' }) // Changed from PENDING to ACTIVE for immediate use
      .eq('id', clientId)
      .select()
      .single();

    const client = clientData as Client | null;

    if (error || !client) throw error || new Error('Client not found');

    // Notify client
    const { Bot } = await import('grammy');
    const { config } = await import('../../../shared/config/index.js');
    const mainBot = new Bot(config.MAIN_BOT_TOKEN);

    await mainBot.api.sendMessage(
      Number(client.telegram_user_id),
      withFooter(`
🎉 <b>Account Approved!</b>

Your account has been approved and is ready to use.

<b>Next steps:</b>
1. Create your first Selling Bot
2. Configure subscription plans
3. Link your Telegram channel
4. Start accepting subscribers!

Use /start to begin.
`),
      { parse_mode: 'HTML' }
    );

    await ctx.reply(`✅ Client "${client.business_name}" approved and notified.`);
    logger.info({ clientId }, 'Client approved by admin');
  } catch (error) {
    logger.error({ error, clientId }, 'Failed to approve client');
    await ctx.reply('❌ Failed to approve client.');
  }
}

async function showSuspendConfirm(ctx: MainBotContext, clientId: string) {
  const { data } = await supabase
    .from('clients')
    .select('business_name')
    .eq('id', clientId)
    .single();

  const client = data as Pick<Client, 'business_name'> | null;

  if (!client) {
    await ctx.reply('❌ Client not found');
    return;
  }

  const keyboard = new InlineKeyboard()
    .text('🚫 Confirm Suspend', `confirm_suspend:${clientId}`)
    .text('❌ Cancel', `view_client:${clientId}`);

  await ctx.reply(
    `⚠️ <b>Suspend Client</b>\n\nAre you sure you want to suspend "<b>${escapeHtml(client.business_name)}</b>"?\n\nThis will pause all their selling bots.`,
    {
      parse_mode: 'HTML',
      reply_markup: keyboard,
    }
  );
}

function getStatusEmoji(status: string): string {
  switch (status) {
    case 'ACTIVE': return '✅';
    case 'TRIAL': return '🆓';
    case 'PENDING': return '⏳';
    case 'EXPIRED': return '⚠️';
    case 'SUSPENDED': return '🚫';
    default: return '❓';
  }
}
