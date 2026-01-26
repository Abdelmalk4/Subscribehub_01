/**
 * My Bots Handler - Complete Implementation with Channel/Group Linking and Plan CRUD
 */

import { Bot, InlineKeyboard, Keyboard } from 'grammy';
import type { MainBotContext } from '../../../shared/types/index.js';
import { supabase, type SellingBot, type Subscriber, type SubscriptionPlan } from '../../../database/index.js';
import { withFooter, formatDate, formatPrice, formatDuration } from '../../../shared/utils/index.js';
import { mainBotLogger as logger } from '../../../shared/utils/index.js';
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

  // Bot plans (list with CRUD)
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
    (ctx.session as any).planCreation = { botId };
    await ctx.conversation.enter('planCreationConversation');
  });

  // Toggle plan active/inactive
  bot.callbackQuery(/^toggle_plan:(.+)$/, clientOnly(), async (ctx) => {
    const planId = ctx.match[1];
    await ctx.answerCallbackQuery('Updating...');
    await togglePlanStatus(ctx, planId);
  });

  // Delete plan confirmation
  bot.callbackQuery(/^delete_plan:(.+)$/, clientOnly(), async (ctx) => {
    const planId = ctx.match[1];
    await ctx.answerCallbackQuery();
    await showDeletePlanConfirm(ctx, planId);
  });

  // Confirm delete plan
  bot.callbackQuery(/^confirm_delete_plan:(.+)$/, clientOnly(), async (ctx) => {
    const planId = ctx.match[1];
    await ctx.answerCallbackQuery('Deleting...');
    await deletePlan(ctx, planId);
  });

  // Link channel to bot
  bot.callbackQuery(/^link_channel:(.+)$/, clientOnly(), async (ctx) => {
    const botId = ctx.match[1];
    await ctx.answerCallbackQuery();
    (ctx.session as any).linkingBotId = botId;
    (ctx.session as any).linkingType = 'channel';

    const keyboard = new Keyboard()
      .requestChat('📢 Select Channel', 1, {
        chat_is_channel: true,
      })
      .placeholder('Select a channel where your bot is admin')
      .oneTime()
      .resized();

    await ctx.reply(withFooter(`
📢 *Link Channel*

Click the button below to select your channel.

*Requirements:*
✅ Your selling bot must be an admin in the channel
✅ You must have access to the channel

_Select the channel you want to link._
    `), {
      parse_mode: 'Markdown',
      reply_markup: keyboard,
    });
  });

  // Link group to bot
  bot.callbackQuery(/^link_group:(.+)$/, clientOnly(), async (ctx) => {
    const botId = ctx.match[1];
    await ctx.answerCallbackQuery();
    (ctx.session as any).linkingBotId = botId;
    (ctx.session as any).linkingType = 'group';

    const keyboard = new Keyboard()
      .requestChat('👥 Select Group', 2, {
        chat_is_channel: false,
        chat_is_forum: false,
      })
      .placeholder('Select a group where your bot is admin')
      .oneTime()
      .resized();

    await ctx.reply(withFooter(`
👥 *Link Group*

Click the button below to select your group.

*Requirements:*
✅ Your selling bot must be an admin in the group
✅ You must have access to the group

_Select the group you want to link._
    `), {
      parse_mode: 'Markdown',
      reply_markup: keyboard,
    });
  });

  // Handle chat_shared event (when user selects a channel or group)
  bot.on('message:chat_shared', async (ctx) => {
    const session = ctx.session as any;
    const linkingBotId = session.linkingBotId;
    if (!linkingBotId) return;

    const sharedChat = ctx.message.chat_shared;
    const chatId = sharedChat.chat_id;
    const linkingType = session.linkingType || 'channel';

    try {
      // Get chat info
      const chat = await ctx.api.getChat(chatId);
      const chatUsername = 'username' in chat ? chat.username : null;
      const chatTitle = 'title' in chat ? chat.title : 'Unknown';

      // Get the bot token to verify admin status
      const { data: botData } = await supabase
        .from('selling_bots')
        .select('bot_token')
        .eq('id', linkingBotId)
        .single();

      const sellingBot = botData as { bot_token: string } | null;

      if (!sellingBot) {
        await ctx.reply('❌ Bot not found. Please try again.', {
          reply_markup: { remove_keyboard: true },
        });
        session.linkingBotId = undefined;
        return;
      }

      // Verify selling bot is admin in the chat
      try {
        const { Bot: GrammyBot } = await import('grammy');
        const tempBot = new GrammyBot(sellingBot.bot_token);
        const botMember = await tempBot.api.getChatMember(chatId, (await tempBot.api.getMe()).id);

        if (!['administrator', 'creator'].includes(botMember.status)) {
          await ctx.reply(withFooter(`
❌ *Cannot Link ${linkingType === 'channel' ? 'Channel' : 'Group'}*

Your selling bot is not an admin in "${chatTitle}".

*To fix this:*
1. Go to "${chatTitle}" settings
2. Add your selling bot as an admin
3. Try linking again
          `), {
            parse_mode: 'Markdown',
            reply_markup: { remove_keyboard: true },
          });
          session.linkingBotId = undefined;
          return;
        }
      } catch (verifyError) {
        logger.error({ error: verifyError, chatId }, 'Failed to verify bot admin status');
        await ctx.reply(withFooter(`
❌ *Cannot Link ${linkingType === 'channel' ? 'Channel' : 'Group'}*

Could not verify bot admin status in "${chatTitle}".

*Possible reasons:*
• Bot is not a member of the ${linkingType}
• Bot doesn't have permission to view members

Please add your selling bot as an admin and try again.
        `), {
          parse_mode: 'Markdown',
          reply_markup: { remove_keyboard: true },
        });
        session.linkingBotId = undefined;
        return;
      }

      // Update bot with linked channel
      await (supabase.from('selling_bots') as any)
        .update({
          linked_channel_id: chatId,
          linked_channel_username: chatUsername,
        })
        .eq('id', linkingBotId);

      // Clear session
      session.linkingBotId = undefined;
      session.linkingType = undefined;

      const emoji = linkingType === 'channel' ? '📢' : '👥';
      await ctx.reply(withFooter(`
✅ *${linkingType === 'channel' ? 'Channel' : 'Group'} Linked Successfully!*

${emoji} *Name:* ${chatTitle}
${chatUsername ? `*Username:* @${chatUsername}` : '_No public username_'}

Your selling bot will now manage access to this ${linkingType}.
      `), {
        parse_mode: 'Markdown',
        reply_markup: { remove_keyboard: true },
      });

      // Refresh bot details
      await showBotDetails(ctx, linkingBotId);
    } catch (error) {
      logger.error({ error, chatId }, 'Failed to link chat');
      await ctx.reply('❌ Failed to link. Please try again.', {
        reply_markup: { remove_keyboard: true },
      });
      session.linkingBotId = undefined;
    }
  });
}

// =====================
// Helper Functions
// =====================

async function showMyBots(ctx: MainBotContext) {
  const client = ctx.client!;

  const { data, error } = await supabase
    .from('selling_bots')
    .select('*, subscribers(count)')
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
    .select('*, subscribers(count), subscription_plans(count)')
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
    .text('👥 Link Group', `link_group:${bot.id}`)
    .row()
    .text('➕ Add Plan', `create_plan:${bot.id}`)
    .row()
    .text(
      bot.status === 'ACTIVE' ? '⏸️ Pause Bot' : '▶️ Activate Bot',
      `toggle_bot:${bot.id}`
    )
    .row()
    .text('« Back to My Bots', 'my_bots');

  const linkedInfo = bot.linked_channel_username 
    ? `✅ @${bot.linked_channel_username}` 
    : bot.linked_channel_id 
      ? `✅ ID: ${bot.linked_channel_id}` 
      : '❌ Not linked';

  const message = `
🤖 *Bot: @${bot.bot_username}*

*Status:* ${bot.status === 'ACTIVE' ? '🟢 Active' : '🔴 Paused'}
*Name:* ${bot.bot_name || 'Not set'}

*Statistics:*
• Total Subscribers: ${subscriberCount}
• Active Subscribers: ${activeSubscribers || 0}
• Plans: ${planCount}

*Linked Channel/Group:* ${linkedInfo}

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
    .select('*, subscription_plans(name)')
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
    .row();

  if (!plans || plans.length === 0) {
    keyboard.text('« Back to Bot', `view_bot:${botId}`);
    await ctx.reply(
      withFooter('📋 *Subscription Plans*\n\nNo plans created yet.\n\nCreate your first plan to start accepting subscribers!'),
      { parse_mode: 'Markdown', reply_markup: keyboard }
    );
    return;
  }

  let message = '📋 *Subscription Plans*\n\n';

  for (const plan of plans) {
    const status = plan.is_active ? '✅' : '❌';
    message += `${status} *${plan.name}*\n`;
    message += `   ${formatPrice(plan.price_amount, plan.price_currency)} / ${formatDuration(plan.duration_days)}\n`;
    if (plan.description) message += `   _${plan.description}_\n`;
    message += '\n';

    keyboard
      .text(plan.is_active ? '⏸️' : '▶️', `toggle_plan:${plan.id}`)
      .text('🗑️', `delete_plan:${plan.id}`)
      .row();
  }

  keyboard.text('« Back to Bot', `view_bot:${botId}`);

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

  await (supabase.from('selling_bots') as any)
    .update({ status: newStatus })
    .eq('id', botId);

  await ctx.reply(
    newStatus === 'ACTIVE'
      ? '✅ Bot activated! It will now respond to subscribers.'
      : '⏸️ Bot paused. It will show "temporarily unavailable" to subscribers.'
  );

  await showBotDetails(ctx, botId);
}

async function togglePlanStatus(ctx: MainBotContext, planId: string) {
  const { data } = await supabase
    .from('subscription_plans')
    .select('is_active, bot_id')
    .eq('id', planId)
    .single();

  const plan = data as { is_active: boolean; bot_id: string } | null;

  if (!plan) {
    await ctx.reply('❌ Plan not found');
    return;
  }

  await (supabase.from('subscription_plans') as any)
    .update({ is_active: !plan.is_active })
    .eq('id', planId);

  await ctx.reply(plan.is_active ? '⏸️ Plan deactivated.' : '✅ Plan activated.');
  await showBotPlans(ctx, plan.bot_id);
}

async function showDeletePlanConfirm(ctx: MainBotContext, planId: string) {
  const { data } = await supabase
    .from('subscription_plans')
    .select('name, bot_id')
    .eq('id', planId)
    .single();

  const plan = data as { name: string; bot_id: string } | null;

  if (!plan) {
    await ctx.reply('❌ Plan not found');
    return;
  }

  const keyboard = new InlineKeyboard()
    .text('🗑️ Yes, Delete', `confirm_delete_plan:${planId}`)
    .text('❌ Cancel', `bot_plans:${plan.bot_id}`);

  await ctx.reply(withFooter(`
⚠️ *Delete Plan*

Are you sure you want to delete "${plan.name}"?

This cannot be undone. Existing subscribers will keep their subscriptions, but no new subscribers can select this plan.
  `), {
    parse_mode: 'Markdown',
    reply_markup: keyboard,
  });
}

async function deletePlan(ctx: MainBotContext, planId: string) {
  const { data } = await supabase
    .from('subscription_plans')
    .select('bot_id')
    .eq('id', planId)
    .single();

  const plan = data as { bot_id: string } | null;

  if (!plan) {
    await ctx.reply('❌ Plan not found');
    return;
  }

  await (supabase.from('subscription_plans') as any)
    .delete()
    .eq('id', planId);

  await ctx.reply('🗑️ Plan deleted.');
  await showBotPlans(ctx, plan.bot_id);
}
