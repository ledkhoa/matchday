import { getPlatformProxy } from 'wrangler';
import type { CloudflareEnv } from '../types/env';
import { syncDailyFixtures } from './api-football';

async function runCliSync() {
  console.log('[FIXTURES] Connecting to local Cloudflare D1 environment...');
  const proxy = await getPlatformProxy<CloudflareEnv>();
  const { env, dispose } = proxy;

  try {
    const apiKey = env.API_FOOTBALL_KEY || process.env.API_FOOTBALL_KEY;
    if (!apiKey || apiKey === 'your_api_key_here') {
      console.error(
        '❌ Error: API_FOOTBALL_KEY is not configured in .dev.vars or environment.',
      );
      process.exit(1);
    }

    // Support optional CLI argument: bun run db:sync-fixtures 2026-09-10
    const targetDate = process.argv[2] || new Date().toISOString().slice(0, 10);
    console.log(
      `[FIXTURES] Syncing official fixtures for date: ${targetDate}...`,
    );

    const result = await syncDailyFixtures(env.DB, apiKey, targetDate);

    console.log('\n--- Fixture Sync Summary ---');
    console.log(`📅 Target Date:         ${result.date}`);
    console.log(`📡 Worldwide Matches:   ${result.totalReceived}`);
    console.log(`⚽ Supported Matches:   ${result.supportedFound}`);
    console.log(`💾 Persisted in D1:     ${result.persistedCount}`);
    if (result.errors.length > 0) {
      console.warn('⚠️  Warnings/Errors:', result.errors);
    }
    console.log('----------------------------\n');
    console.log('✅ Fixture synchronization complete!');
  } catch (err) {
    console.error('[FIXTURES] Sync failed:', err);
    process.exit(1);
  } finally {
    await dispose();
  }
}

runCliSync();
