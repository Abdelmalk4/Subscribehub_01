/**
 * Data Migration Script: Encrypt Existing Keys
 * 
 * encrypts 'bot_token' and 'nowpayments_api_key' for all existing selling bots.
 * Idempotent-ish: Checks if data looks encrypted before re-encrypting.
 * 
 * Usage: npx tsx scripts/migrate-encryption.ts
 */

import { createClient } from '@supabase/supabase-js';
import { encrypt } from '../src/shared/utils/encryption.js';
import { config } from '../src/shared/config/index.js';
import 'dotenv/config';

// Re-initialize supabase to ensure we use process.env directly if needed
// or just use the imported config which should be loaded
const supabaseUrl = process.env.SUPABASE_URL || config.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || config.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function migrate() {
  console.log('🔐 Starting Encryption Migration...');

  // Fetch all bots
  const { data: bots, error } = await supabase
    .from('selling_bots')
    .select('id, bot_token, nowpayments_api_key, bot_username');

  if (error) {
    console.error('❌ Failed to fetch bots:', error);
    process.exit(1);
  }

  console.log(`📋 Found ${bots.length} bots to check.`);

  let updatedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (const bot of bots) {
    const changes: any = {};
    let needsUpdate = false;

    // Check Bot Token
    if (bot.bot_token && !isEncrypted(bot.bot_token)) {
      try {
        changes.bot_token = encrypt(bot.bot_token);
        needsUpdate = true;
      } catch (e) {
        console.error(`Error encrypting token for @${bot.bot_username}:`, e);
        errorCount++;
      }
    }

    // Check API Key
    if (bot.nowpayments_api_key && !isEncrypted(bot.nowpayments_api_key)) {
      try {
        changes.nowpayments_api_key = encrypt(bot.nowpayments_api_key);
        needsUpdate = true;
      } catch (e) {
        console.error(`Error encrypting key for @${bot.bot_username}:`, e);
        errorCount++;
      }
    }

    if (needsUpdate) {
      const { error: updateError } = await supabase
        .from('selling_bots')
        .update(changes)
        .eq('id', bot.id);

      if (updateError) {
        console.error(`❌ Failed to update bot @${bot.bot_username}:`, updateError);
        errorCount++;
      } else {
        console.log(`✅ Secured bot @${bot.bot_username}`);
        updatedCount++;
      }
    } else {
      skippedCount++;
    }
  }

  console.log('\n--------------------------------');
  console.log(`🎉 Migration Complete`);
  console.log(`✅ Updated: ${updatedCount}`);
  console.log(`⏭️  Skipped (Already Encrypted): ${skippedCount}`);
  console.log(`❌ Errors: ${errorCount}`);
}

function isEncrypted(text: string): boolean {
  // Simple heuristic: Encrypted string format is IV:AuthTag:Content
  // IV is 16 bytes = 32 hex chars
  // AuthTag is 16 bytes = 32 hex chars
  // Content is variable
  // So it should have at least 2 colons and reasonable length
  if (!text || typeof text !== 'string') return false;
  
  const parts = text.split(':');
  if (parts.length !== 3) return false;
  
  // Check if parts are hex
  const isHex = (str: string) => /^[0-9a-fA-F]+$/.test(str);
  
  return isHex(parts[0]) && isHex(parts[1]) && isHex(parts[2]);
}

migrate();
