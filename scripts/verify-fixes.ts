/**
 * Verification Script for Critical Fixes
 * 
 * Usage:
 * npx tsx scripts/verify-fixes.ts
 */

import { encrypt, decrypt } from '../src/shared/utils/encryption.js';
import { supabase } from '../src/database/index.js';
import { config } from '../src/shared/config/index.js';

async function runVerification() {
  console.log('🔍 Starting Verification of Critical Fixes...\n');

  // 1. Encryption Verification
  console.log('🔐 Testing Encryption...');
  try {
    const original = '123456789:ABCdefGHIjklMNOpqrsTUVwxyz';
    const encrypted = encrypt(original);
    const decrypted = decrypt(encrypted);

    if (original === decrypted && encrypted !== original) {
      console.log('✅ Encryption/Decryption working correctly');
    } else {
      console.error('❌ Encryption test failed');
      console.error({ original, encrypted, decrypted });
    }
  } catch (error) {
    console.error('❌ Encryption test threw error:', error);
  }

  // 2. Database RPC Verification (Mock)
  console.log('\n💰 Testing Payment RPC...');
  // Note: We can't easily integration test this without a real transaction record
  // But we can check if the RPC exists
  const { error: rpcError } = await supabase.rpc('process_payment_webhook', {
    p_invoice_id: 'dummy_check',
    p_payment_status: 'waiting',
    p_actually_paid: 0,
    p_pay_currency: 'USDT'
  });

  if (rpcError && rpcError.message.includes('Transaction not found')) {
      // This is GOOD - it means the RPC executed and logic flowed to the check
      console.log('✅ Payment RPC exists and logic is executing (Transaction Check Passed)');
  } else if (rpcError) {
      console.error('❌ Payment RPC failed unexpectedly:', rpcError);
  } else {
      console.log('⚠️ Payment RPC returned success for dummy data (Unexpected)');
  }

  // 3. Auth Middleware Check (Conceptual)
  console.log('\n🛡️  API Auth Config Check...');
  if (config.ADMIN_API_KEY && config.ADMIN_API_KEY.length > 0) {
      console.log('✅ ADMIN_API_KEY is configured');
  } else {
      console.error('❌ ADMIN_API_KEY is missing');
  }
  
  if (config.ALLOWED_ORIGINS && config.ALLOWED_ORIGINS.length > 0) {
      console.log(`✅ Allowed Origins: ${config.ALLOWED_ORIGINS.join(', ')}`);
  } else {
      console.error('❌ ALLOWED_ORIGINS is not configured');
  }

  console.log('\n----------------------------------------');
  console.log('✅ Verification Script Complete');
  process.exit(0);
}

runVerification();
