/**
 * Session Storage Utility
 * Provides persistent session storage using Supabase
 */

import { StorageAdapter } from 'grammy';
import { supabase } from '../../database/index.js';
import { createLogger } from './logger.js';

const logger = createLogger('session-storage');

/**
 * Create a Supabase-backed session storage adapter for grammY
 */
export function createSupabaseStorage<T>(): StorageAdapter<T> {
  return {
    async read(key: string): Promise<T | undefined> {
      try {
        const { data, error } = await supabase
          .from('bot_sessions')
          .select('session')
          .eq('id', key)
          .single();

        if (error || !data) {
          return undefined;
        }

        // Cast to any to handle missing generated types for bot_sessions table
        return (data as { session: T }).session;
      } catch (error) {
        logger.error({ error, key }, 'Failed to read session');
        return undefined;
      }
    },

    async write(key: string, value: T): Promise<void> {
      try {
        const { error } = await (supabase.from('bot_sessions') as any)
          .upsert({
            id: key,
            session: value,
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'id',
          });

        if (error) {
          throw error;
        }
      } catch (error) {
        logger.error({ error, key }, 'Failed to write session');
      }
    },

    async delete(key: string): Promise<void> {
      try {
        const { error } = await supabase
          .from('bot_sessions')
          .delete()
          .eq('id', key);

        if (error) {
          throw error;
        }
      } catch (error) {
        logger.error({ error, key }, 'Failed to delete session');
      }
    },
  };
}
