# TeleTrade

**White-label Telegram subscription automation platform with crypto payments**

## Overview

TeleTrade enables Telegram trading signal channel owners to automate subscriber
management, payment processing, and access control through cryptocurrency
payments.

- **Multitenancy**: Clients can run multiple selling bots (managed via database)
- **7-day free trial**: Automatic trial activation on first bot creation
- **Automated access control**: Grant/revoke channel access based on
  subscription
- **White-label branding**: Customizable messages with mandatory platform footer

## Architecture

```
┌─────────────────┐     ┌─────────────────┐
│    Main Bot     │     │  Selling Bots   │
│  (Admin Control)│     │ (Subscriber UX) │
└────────┬────────┘     └────────┬────────┘
         │                       │
         └───────────┬───────────┘
                     │
              ┌──────┴──────┐
              │   Supabase  │
              │  PostgreSQL │
              └──────┬──────┘
                     │
              ┌──────┴──────┐
              │   Backend   │
              │  (Fastify)  │
              └──────┬──────┘
                     │
              ┌──────┴──────┐
              │ NOWPayments │
              │   Webhooks  │
              └─────────────┘
```

## Tech Stack

- **Runtime**: Node.js 20+
- **Language**: TypeScript
- **Bot Framework**: grammY
- **Server Framework**: Fastify
- **Database**: Supabase (PostgreSQL)
- **Payments**: NOWPayments (crypto)
- **Hosting**: Railway.com

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your configuration
```

### 3. Setup Database

```bash
npm run db:generate
npm run db:push
```

### 4. Run Development

```bash
# Terminal 1: Start Main Bot
npm run dev:main-bot

# Terminal 2: Start Selling Bots
npm run dev:selling-bot

# Terminal 3: Start Backend (Webhooks & Jobs)
npm run dev:backend
```

## Project Structure

```
src/
├── main-bot/           # Control plane (admin/client management)
│   ├── handlers/       # Command handlers
│   ├── middleware/     # Auth, client loading
│   └── index.ts        # Entry point
│
├── selling-bot/        # Subscriber interface
│   ├── handlers/       # Subscription/payment handlers
│   ├── middleware/     # Bot config, subscriber loading
│   └── index.ts        # Entry point + bot factory
│
├── backend/            # Backend API & Jobs
│   ├── api/            # API routes
│   ├── jobs/           # Scheduled tasks (cron)
│   ├── webhooks/       # Payment callbacks
│   └── index.ts        # Entry point
│
├── database/           # Prisma client
├── shared/             # Shared utilities
│   ├── config/         # Environment config
│   ├── types/          # TypeScript types
│   ├── utils/          # Helpers (logger, date, format)
│   └── integrations/   # NOWPayments, Telegram utils
│
└── 
```

## Key Features

- **Non-custodial payments**: Clients' funds go directly to their wallet

## Environment Variables

| Variable                       | Description                           |
| ------------------------------ | ------------------------------------- |
| `SUPABASE_URL`                 | Supabase project URL                  |
| `DATABASE_URL`                 | PostgreSQL connection string          |
| `MAIN_BOT_TOKEN`               | Main Bot token from @BotFather        |
| `PLATFORM_ADMIN_IDS`           | Comma-separated admin Telegram IDs    |
| `NOWPAYMENTS_IPN_CALLBACK_URL` | Webhook URL for payment notifications |

See `.env.example` for full configuration.

## Deployment (Railway)

1. Create new Railway project
2. Connect GitHub repo
3. Add environment variables
4. Deploy Main Bot and Selling Bot as separate services

## License

Proprietary - All rights reserved
