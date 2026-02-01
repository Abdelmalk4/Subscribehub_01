import 'dotenv/config';
import { supabase } from '../src/database/index.js';
import { decrypt } from '../src/shared/utils/index.js';
import fs from 'fs';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env');
if (!fs.existsSync(envPath)) {
  console.error(`ERROR: .env file NOT found at: ${envPath}`);
  // Try to list files in cwd to see what IS there
  console.log('Files in CWD:', fs.readdirSync(process.cwd()));
} else {
  console.log(`OK: .env file found at: ${envPath}`);
}


async function diagnose() {
  console.log('Starting diagnosis...');
  
  // 1. Check database connection
  const { data: test, error: testError } = await supabase.from('selling_bots').select('count').limit(1);
  if (testError) {
    console.error('CRITICAL: Database connection failed:', testError);
    process.exit(1);
  }
  console.log('Database connected.');

  // 2. Fetch active bots
  const { data: bots, error } = await supabase
    .from('selling_bots')
    .select(`
      *,
      clients (*)
    `)
    .eq('status', 'ACTIVE');

  if (error) {
    console.error('Error fetching bots:', error);
    return;
  }

  console.log(`Found ${bots?.length || 0} active bots.`);

  if (!bots || bots.length === 0) {
    console.log('No active bots found. This might be why they are "not working".');
    return;
  }

  for (const bot of bots) {
    console.log(`\n[Bot ${bot.id}] @${bot.bot_username || 'unknown'}`);
    
    // Check client
    const client = bot.clients;
    if (!client) {
      console.error('  ❌ No linked client found!');
      continue;
    }
    
    console.log(`  Client ID: ${client.id}`);
    console.log(`  Client Status: ${client.status}`);
    
    if (client.status !== 'ACTIVE' && client.status !== 'TRIAL') {
      console.warn(`  ⚠️ Bot will NOT start because client status is ${client.status} (must be ACTIVE or TRIAL)`);
    } else {
        console.log('  ✅ Client status OK');
    }

    // Check token
    try {
      let token = bot.bot_token;
      let decrypted = false;
      
      if (!token) {
        console.error('  ❌ Token is missing!');
        continue;
      }

      if (token.includes(':') && token.split(':').length === 3) {
         try {
             token = decrypt(token);
             decrypted = true;
             console.log('  ✅ Token decrypted successfully');
         } catch (e) {
             console.error('  ❌ Token decryption failed:', e);
             continue;
         }
      } else {
         console.log('  ℹ️ Token treated as raw (not encrypted format 3 parts)');
      }
      
      // Basic validation of token format: 123456:ABC...
      const parts = token.split(':');
      if (parts.length === 2 && !isNaN(Number(parts[0]))) {
          console.log('  ✅ Token format valid');
          
          // Optional: Check if we can actually getMe (needs http request)
          // We won't do that here to avoid network spam, but good to know format is valid.
      } else {
          console.error(`  ❌ Invalid token format: ${token.substring(0, 5)}...`);
      }
      
    } catch (e) {
      console.error('  ❌ Unexpected error checking token:', e);
    }
  }
  console.log('\nDiagnosis complete.');
}

diagnose().catch(console.error);
