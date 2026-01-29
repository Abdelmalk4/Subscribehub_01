import { Client } from 'pg';
import fs from 'fs';
import path from 'path';
import 'dotenv/config';

async function deploy() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('❌ DATABASE_URL is missing');
    process.exit(1);
  }

  const client = new Client({ connectionString });
  
  try {
    await client.connect();
    console.log('✅ Connected to database');

    const sqlPath = path.join(process.cwd(), 'supabase/migrations/002_process_payment_rpc.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log(`📜 Deploying RPC from ${sqlPath}...`);
    await client.query(sql);

    console.log('✅ RPC deployed successfully');
  } catch (error) {
    console.error('❌ Failed to deploy RPC:', error);
  } finally {
    await client.end();
  }
}

deploy();
