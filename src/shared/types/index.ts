/**
 * TeleTrade Shared Types
 * Type definitions used across Main Bot, Selling Bot, and Backend
 */

import type { Context as GrammyContext, SessionFlavor } from 'grammy';
import type { Conversation, ConversationFlavor } from '@grammyjs/conversations';

// =================================
// Session Data Types
// =================================

export interface MainBotSessionData {
  // Registration flow
  registration?: {
    step: 'business_name' | 'channel' | 'email' | 'confirm';
    businessName?: string;
    channelUsername?: string;
    contactEmail?: string;
  };
  // Bot creation flow
  botCreation?: {
    step: 'token' | 'nowpayments_key' | 'wallet' | 'channel' | 'confirm';
    botToken?: string;
    botUsername?: string;
    nowpaymentsApiKey?: string;
    walletAddress?: string;
    channelId?: string;
    channelUsername?: string;
  };
  // Plan creation flow
  planCreation?: {
    step?: 'name' | 'price' | 'currency' | 'duration' | 'description' | 'confirm';
    name?: string;
    priceAmount?: number;
    priceCurrency?: string;
    durationDays?: number;
    description?: string;
    botId?: string;
  };
  // Channel/Group linking
  linkingBotId?: string;
  linkingType?: 'channel' | 'group';
  // Settings editing
  editingField?: 'business_name' | 'email';
}

export interface SellingBotSessionData {
  // Subscription purchase flow
  purchase?: {
    step: 'plan_selected' | 'awaiting_payment' | 'confirming';
    planId?: string;
    invoiceId?: string;
    paymentAddress?: string;
    amount?: number;
    currency?: string;
    expiresAt?: Date;
  };
}

// =================================
// Context Types
// =================================

export type MainBotContext = GrammyContext &
  SessionFlavor<MainBotSessionData> &
  ConversationFlavor & {
    // Custom context properties
    client?: ClientData;
    isAdmin?: boolean;
  };

export type SellingBotContext = GrammyContext &
  SessionFlavor<SellingBotSessionData> &
  ConversationFlavor & {
    // Bot-specific context
    botConfig?: SellingBotConfig;
    subscriber?: SubscriberData;
  };

export type MainBotConversation = Conversation<MainBotContext>;
export type SellingBotConversation = Conversation<SellingBotContext>;

// =================================
// Client & Admin Types
// =================================

export interface ClientData {
  id: string;
  telegramUserId: bigint;
  username?: string;
  businessName: string;
  status: ClientStatus;
  trialStartDate?: Date;
  trialEndDate?: Date;
  trialActivated: boolean;
  platformSubscriptionEnd?: Date;
  subscriptionPlanId?: string;
}

export type ClientStatus = 
  | 'PENDING'
  | 'ACTIVE'
  | 'TRIAL'
  | 'EXPIRED'
  | 'SUSPENDED';

export interface PlatformAdminData {
  id: string;
  telegramUserId: bigint;
  username?: string;
  role: 'SUPER_ADMIN' | 'SUPPORT';
}

// =================================
// Selling Bot Types
// =================================

export interface SellingBotConfig {
  id: string;
  clientId: string;
  botToken: string;
  botUsername: string;
  botName?: string;
  nowpaymentsApiKey: string;
  cryptoWalletAddress: string;
  linkedChannelId?: bigint;
  linkedChannelUsername?: string;
  welcomeMessage?: string;
  status: BotStatus;
}

export type BotStatus = 'ACTIVE' | 'PAUSED' | 'DELETED';

// =================================
// Subscriber Types
// =================================

export interface SubscriberData {
  id: string;
  telegramUserId: bigint;
  username?: string;
  firstName?: string;
  lastName?: string;
  botId: string;
  subscriptionStatus: SubscriptionStatus;
  subscriptionStartDate?: Date;
  subscriptionEndDate?: Date;
  subscriptionPlanId?: string;
}

export type SubscriptionStatus = 
  | 'ACTIVE'
  | 'EXPIRED'
  | 'PENDING_PAYMENT'
  | 'REVOKED';

// =================================
// Plan Types
// =================================

export interface SubscriptionPlanData {
  id: string;
  planType: 'PLATFORM' | 'CLIENT';
  botId?: string;
  name: string;
  description?: string;
  durationDays: number;
  priceAmount: number;
  priceCurrency: string;
  isActive: boolean;
  // Platform plan limits
  maxBots?: number;
  maxSubscribers?: number;
}

// =================================
// Payment Types
// =================================

export interface PaymentData {
  id: string;
  paymentType: 'SUBSCRIBER_SUBSCRIPTION' | 'PLATFORM_SUBSCRIPTION';
  subscriberId?: string;
  clientId?: string;
  planId: string;
  nowpaymentsInvoiceId?: string;
  amount: number;
  currency: string;
  paymentAddress?: string;
  transactionHash?: string;
  paymentStatus: PaymentStatus;
  createdAt: Date;
  confirmedAt?: Date;
  expiresAt?: Date;
}

export type PaymentStatus = 
  | 'PENDING'
  | 'CONFIRMING'
  | 'CONFIRMED'
  | 'FAILED'
  | 'EXPIRED'
  | 'REFUNDED';

// =================================
// NOWPayments Types
// =================================

export interface NOWPaymentsInvoice {
  id: string;
  order_id: string;
  order_description: string;
  price_amount: number;
  price_currency: string;
  pay_amount: number;
  pay_currency: string;
  pay_address: string;
  invoice_url: string;
  created_at: string;
  updated_at: string;
  expiration_estimate_date: string;
}

export interface NOWPaymentsWebhookPayload {
  payment_id: number;
  invoice_id: number;
  payment_status: string;
  pay_address: string;
  price_amount: number;
  price_currency: string;
  pay_amount: number;
  pay_currency: string;
  actually_paid: number;
  order_id: string;
  order_description: string;
  purchase_id: string;
  outcome_amount: number;
  outcome_currency: string;
}

// =================================
// Access Control Types
// =================================

export interface AccessLogEntry {
  id: string;
  subscriberId: string;
  botId: string;
  action: 'GRANT' | 'REVOKE' | 'MANUAL_EXTEND' | 'MANUAL_REVOKE';
  performedBy: 'SYSTEM' | 'CLIENT' | 'ADMIN';
  performerId?: string;
  reason?: string;
  createdAt: Date;
}

// =================================
// API Response Types
// =================================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
