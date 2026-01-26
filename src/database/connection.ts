/**
 * Supabase Client
 * Database connection using Supabase JS client
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config, isDevelopment } from '../shared/config/index.js';
import { createLogger } from '../shared/utils/logger.js';
import type { Database } from './types.js';

const logger = createLogger('database');

// Create Supabase client
export const supabase = createClient<Database>(
  config.SUPABASE_URL,
  config.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    db: {
      schema: 'public',
    },
  }
);

// Log connection status
if (isDevelopment) {
  logger.info('Supabase client initialized');
}

export default supabase;
