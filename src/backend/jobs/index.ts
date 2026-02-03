/**
 * Scheduled Jobs Index
 * CRON tasks for automated processing
 */

import cron from 'node-cron';
import { cronLogger as logger } from '../../shared/utils/index.js';
import { runExpirationCheck } from './expiration-check.js';
import { runReminderSender } from './reminder-sender.js';
import { runTrialCheck } from './trial-check.js';
import { runPaymentReconciliation } from './payment-reconciliation.js';


/**
 * Start all scheduled jobs
 */
export function startScheduledJobs(): void {
  logger.info('Starting scheduled jobs...');

  // Hourly: Check for expired subscriptions
  cron.schedule('0 * * * *', async () => {
    logger.info('Running hourly expiration check');
    await runExpirationCheck();
  });

  // Daily at 00:00 UTC: Check for trial expirations
  cron.schedule('0 0 * * *', async () => {
    logger.info('Running daily trial check');
    await runTrialCheck();
  });

  // Daily at 02:00 UTC: Payment reconciliation
  cron.schedule('0 2 * * *', async () => {
    logger.info('Running daily payment reconciliation');
    await runPaymentReconciliation();
  });

  // Daily at 09:00 UTC: Send renewal reminders
  cron.schedule('0 9 * * *', async () => {
    logger.info('Running daily reminder sender');
    await runReminderSender();
  });

  logger.info('Scheduled jobs registered');
}

