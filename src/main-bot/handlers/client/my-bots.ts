/**
 * My Bots Handler (Supabase version)
 * Client's bot management
 */

import { Bot, InlineKeyboard } from 'grammy';
import type { MainBotContext } from '../../../shared/types/index.js';
import { supabase, type SellingBot, type Subscriber, type SubscriptionPlan } from '../../../database/index.js';
import { withFooter, formatDate } from '../../../shared/utils/index.js';
import { clientOnly } from '../../middleware/client.js';

export function setupMyBotsHandler(bot: Bot<MainBotContext>) {
  // My bots list
  bot.callbackQuery('my_bots', clientOnly(), async (ctx) => {
    await ctx.answerCallbackQuery();
    await showMyBots(ctx);
  });

  // View specific bot
  bot.callbackQuery(/^view_bot:(.+)$/, clientOnly(), async (ctx) => {
    const botId = ctx.match[1];
    await ctx.answerCallbackQuery();
    await showBotDetails(ctx, botId);
  });

  // Bot subscribers
  bot.callbackQuery(/^bot_subscribers:(.+)$/, clientOnly(), async (ctx) => {
    const botId = ctx.match[1];
    await ctx.answerCallbackQuery();
    await showBotSubscribers(ctx, botId);
  });

  // Bot plans
  bot.callbackQuery(/^bot_plans:(.+)$/, clientOnly(), async (ctx) => {
    const botId = ctx.match[1];
    await ctx.answerCallbackQuery();
    await showBotPlans(ctx, botId);
  });

  // Pause/activate bot
  bot.callbackQuery(/^toggle_bot:(.+)$/, clientOnly(), async (ctx) => {
    const botId = ctx.match[1];
    await ctx.answerCallbackQuery('Processing...');
    await toggleBotStatus(ctx, botId);
  });

  // Create new bot
  bot.callbackQuery('create_bot', clientOnly(), async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.conversation.enter('botCreationConversation');
  });

  // Create plan for a bot
  bot.callbackQuery(/^create_plan:(.+)$/, clientOnly(), async (ctx) => {
    const botId = ctx.match[1];
    await ctx.answerCallbackQuery();
    ctx.session.planCreation = { botId };
    await ctx.conversation.enter('planCreationConversation');
  });

  // Link channel to bot
  bot.callbackQuery(/^link_channel:(.+)$/, clientOnly(), async (ctx) => {
    const botId = ctx.match[1];
    await ctx.answerCallbackQuery();
    ctx.session.linkingBotId = botId;

    // Use KeyboardButtonRequestChat to let user select a channel
    const { Keyboard } = await import('grammy');
    const keyboard = new Keyboard()
      .requestChat('📢 Select Channel', 1, {
        chat_is_channel: true,
        bot_is_member: true,
      })
      .placeholder('Select a channel to link')
      .oneTime()
      .resized();

    await ctx.reply(withFooter(`
📢 *Link Channel*

Click the button below to select a channel.

*Before linking:*
1. Add your selling bot as an admin to the channel
2. Give it permission to invite users

_The channel picker will appear when you click the button._
    `), {
      parse_mode: 'Markdown',
      reply_markup: keyboard,
    });
  });

  // Handle chat_shared event (when user selects a channel)
  bot.on('message:chat_shared', async (ctx) => {
    const linkingBotId = ctx.session.linkingBotId;
    if (!linkingBotId) return;

    const sharedChat = ctx.message.chat_shared;
    const channelId = sharedChat.chat_id;

    try {
      // Get channel info
      const chat = await ctx.api.getChat(channelId);
      const channelUsername = 'username' in chat ? chat.username : null;
      const channelTitle = 'title' in chat ? chat.title : 'Unknown';

      // Update bot with linked channel
      await (supabase.from('selling_bots') as any)
        .update({
          linked_channel_id: channelId,
          linked_channel_username: channelUsername,
        })
        .eq('id', linkingBotId);

      // Clear session
      ctx.session.linkingBotId = undefined;

      await ctx.reply(withFooter(`
✅ *Channel Linked Successfully!*

*Channel:* ${channelTitle}
${channelUsername ? `*Username:* @${channelUsername}` : ''}

Your selling bot will now manage access to this channel.
      `), {
        parse_mode: 'Markdown',
        reply_markup: { remove_keyboard: true },
      });

      // Refresh bot details
      await showBotDetails(ctx, linkingBotId);
    } catch (error) {
      await ctx.reply('❌ Failed to link channel. Make sure your selling bot is an admin in the channel.', {
        reply_markup: { remove_keyboard: true },
      });
    }
  });
}

async function showMyBots(ctx: MainBotContext) {
  const client = ctx.client!;

  const { data, error } = await supabase
    .from('selling_bots')
    .select(`
      *,
      subscribers(count)
    `)
    .eq('client_id', client.id);

  const bots = data as Array<SellingBot & { subscribers: Array<{ count: number }> }> | null;

  if (error) {
    await ctx.reply('❌ Failed to load your bots.');
    return;
  }

  const keyboard = new InlineKeyboard();

  if (!bots || bots.length === 0) {
    keyboard.text('➕ Create Your First Bot', 'create_bot').row();
  } else {
    for (const bot of bots) {
      const statusEmoji = bot.status === 'ACTIVE' ? '🟢' : '🔴';
      const subscriberCount = bot.subscribers?.[0]?.count || 0;
      keyboard.text(
        `${statusEmoji} @${bot.bot_username} (${subscriberCount})`,
        `view_bot:${bot.id}`
      ).row();
    }
    keyboard.text('➕ Create New Bot', 'create_bot').row();
  }

  keyboard.text('« Back', 'start');

  const message = !bots || bots.length === 0
    ? `🤖 *My Selling Bots*\n\nYou don't have any bots yet.\n\nCreate your first selling bot to start accepting subscribers!`
    : `🤖 *My Selling Bots (${bots.length})*\n\nSelect a bot to manage:`;

  await ctx.reply(withFooter(message), {
    parse_mode: 'Markdown',
    reply_markup: keyboard,
  });
}

async function showBotDetails(ctx: MainBotContext, botId: string) {
  const client = ctx.client!;

  const { data, error } = await supabase
    .from('selling_bots')
    .select(`
      *,
      subscribers(count),
      subscription_plans(count)
    `)
    .eq('id', botId)
    .eq('client_id', client.id)
    .single();

  const bot = data as (SellingBot & { 
    subscribers: Array<{ count: number }>; 
    subscription_plans: Array<{ count: number }>;
  }) | null;

  if (error || !bot) {
    await ctx.reply('❌ Bot not found');
    return;
  }

  const { count: activeSubscribers } = await supabase
    .from('subscribers')
    .select('*', { count: 'exact', head: true })
    .eq('bot_id', bot.id)
    .eq('subscription_status', 'ACTIVE');

  const subscriberCount = bot.subscribers?.[0]?.count || 0;
  const planCount = bot.subscription_plans?.[0]?.count || 0;

  const keyboard = new InlineKeyboard()
    .text('👥 Subscribers', `bot_subscribers:${bot.id}`)
    .text('📋 Plans', `bot_plans:${bot.id}`)
    .row()
    .text('📢 Link Channel', `link_channel:${bot.id}`)
    .text('➕ Add Plan', `create_plan:${bot.id}`)
    .row()
    .text(
      bot.status === 'ACTIVE' ? '⏸️ Pause Bot' : '▶️ Activate Bot',
      `toggle_bot:${bot.id}`
    )
    .row()
    .text('« Back to My Bots', 'my_bots');

  const message = `
🤖 *Bot: @${bot.bot_username}*

*Status:* ${bot.status === 'ACTIVE' ? '🟢 Active' : '🔴 Paused'}
*Name:* ${bot.bot_name || 'Not set'}

*Statistics:*
• Total Subscribers: ${subscriberCount}
• Active Subscribers: ${activeSubscribers || 0}
• Plans: ${planCount}

*Channel:* ${bot.linked_channel_username ? `@${bot.linked_channel_username}` : 'Not linked'}

*Share Link:* t.me/${bot.bot_username}
`;

  await ctx.reply(withFooter(message), {
    parse_mode: 'Markdown',
    reply_markup: keyboard,
  });
}

async function showBotSubscribers(ctx: MainBotContext, botId: string) {
  const { data, error } = await supabase
    .from('subscribers')
    .select(`
      *,
      subscription_plans(name)
    `)
    .eq('bot_id', botId)
    .order('created_at', { ascending: false })
    .limit(10);

  const subscribers = data as Array<Subscriber & { subscription_plans: SubscriptionPlan }> | null;

  if (error) {
    await ctx.reply('❌ Failed to load subscribers.');
    return;
  }

  const keyboard = new InlineKeyboard();

  if (!subscribers || subscribers.length === 0) {
    keyboard.text('« Back to Bot', `view_bot:${botId}`);
    await ctx.reply(
      withFooter('👥 *Subscribers*\n\nNo subscribers yet.'),
      { parse_mode: 'Markdown', reply_markup: keyboard }
    );
    return;
  }

  let message = '👥 *Subscribers*\n\n';

  for (const sub of subscribers) {
    const statusEmoji = sub.subscription_status === 'ACTIVE' ? '✅' : '❌';
    const username = sub.username ? `@${sub.username}` : sub.first_name || 'Unknown';
    const plan = sub.subscription_plans?.name || 'N/A';
    const expiry = sub.subscription_end_date ? formatDate(new Date(sub.subscription_end_date)) : 'N/A';

    message += `${statusEmoji} ${username}\n`;
    message += `   Plan: ${plan} | Expires: ${expiry}\n\n`;
  }

  keyboard.text('« Back to Bot', `view_bot:${botId}`);

  await ctx.reply(withFooter(message), {
    parse_mode: 'Markdown',
    reply_markup: keyboard,
  });
}

async function showBotPlans(ctx: MainBotContext, botId: string) {
  const { data, error } = await supabase
    .from('subscription_plans')
    .select('*')
    .eq('bot_id', botId)
    .eq('plan_type', 'CLIENT')
    .order('price_amount', { ascending: true });

  const plans = data as SubscriptionPlan[] | null;

  if (error) {
    await ctx.reply('❌ Failed to load plans.');
    return;
  }

  const keyboard = new InlineKeyboard()
    .text('➕ Create Plan', `create_plan:${botId}`)
    .row()
    .text('« Back to Bot', `view_bot:${botId}`);

  if (!plans || plans.length === 0) {
    await ctx.reply(
      withFooter('📋 *Subscription Plans*\n\nNo plans created yet.'),
      { parse_mode: 'Markdown', reply_markup: keyboard }
    );
    return;
  }

  let message = '📋 *Subscription Plans*\n\n';

  for (const plan of plans) {
    const status = plan.is_active ? '✅' : '❌';
    message += `${status} *${plan.name}*\n`;
    message += `   ${plan.price_amount} ${plan.price_currency} / ${plan.duration_days} days\n\n`;
  }

  await ctx.reply(withFooter(message), {
    parse_mode: 'Markdown',
    reply_markup: keyboard,
  });
}

async function toggleBotStatus(ctx: MainBotContext, botId: string) {
  const client = ctx.client!;

  const { data } = await supabase
    .from('selling_bots')
    .select('status')
    .eq('id', botId)
    .eq('client_id', client.id)
    .single();

  const bot = data as Pick<SellingBot, 'status'> | null;

  if (!bot) {
    await ctx.reply('❌ Bot not found');
    return;
  }

  const newStatus = bot.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';

  await (supabase
    .from('selling_bots') as any)
    .update({ status: newStatus })
    .eq('id', botId);

  await ctx.reply(
    newStatus === 'ACTIVE'
      ? '✅ Bot activated! It will now respond to subscribers.'
      : '⏸️ Bot paused. It will show "temporarily unavailable" to subscribers.'
  );

  // Refresh bot details
  await showBotDetails(ctx, botId);
}
