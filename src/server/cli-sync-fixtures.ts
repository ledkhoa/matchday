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
    const targetDateObj = new Date(targetDate + 'T00:00:00Z');
    const yesterdayDate = new Date(
      targetDateObj.getTime() - 24 * 60 * 60 * 1000,
    )
      .toISOString()
      .slice(0, 10);

    console.log(
      `[FIXTURES] Syncing official fixtures for target date: ${targetDate} and previous day: ${yesterdayDate}...`,
    );

    const todayResult = await syncDailyFixtures(env.DB, apiKey, targetDate);
    const yesterdayResult = await syncDailyFixtures(
      env.DB,
      apiKey,
      yesterdayDate,
    );

    console.log('\n--- Fixture Sync Summary ---');
    console.log(`📅 Target Date (${todayResult.date}):`);
    console.log(`  📡 Worldwide Matches:   ${todayResult.totalReceived}`);
    console.log(`  ⚽ Supported Matches:   ${todayResult.supportedFound}`);
    console.log(`  💾 Persisted in D1:     ${todayResult.persistedCount}`);
    if (todayResult.errors.length > 0) {
      console.warn('  ⚠️  Warnings/Errors:', todayResult.errors);
    }
    console.log(`📅 Previous Day (${yesterdayResult.date}):`);
    console.log(`  📡 Worldwide Matches:   ${yesterdayResult.totalReceived}`);
    console.log(`  ⚽ Supported Matches:   ${yesterdayResult.supportedFound}`);
    console.log(`  💾 Persisted in D1:     ${yesterdayResult.persistedCount}`);
    if (yesterdayResult.errors.length > 0) {
      console.warn('  ⚠️  Warnings/Errors:', yesterdayResult.errors);
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
