import { getPlatformProxy } from 'wrangler';
import type { CloudflareEnv } from '../types/env';
import { ingestRedditHighlights } from './ingest';

async function runCliIngest() {
  console.log('[INGEST] Connecting to local Cloudflare D1 environment...');
  const proxy = await getPlatformProxy<CloudflareEnv>();
  const { env, dispose } = proxy;

  try {
    console.log('[INGEST] Fetching latest goals from Reddit RSS feed...');
    const result = await ingestRedditHighlights(env.DB);

    console.log('\n--- Ingestion Summary ---');
    console.log(`📡 Total Posts Fetched: ${result.totalFetched}`);
    console.log(`⚽ Goals Parsed:        ${result.parsedCount}`);
    console.log(`💾 Goals Saved in D1:   ${result.persistedCount}`);
    console.log(`⏩ Duplicates Skipped:  ${result.skippedCount}`);
    if (result.errors.length > 0) {
      console.warn('⚠️  Warnings/Errors:', result.errors);
    }
    console.log('-------------------------\n');
    console.log(
      '✅ Ingestion complete! Refresh your browser tab to view updated matches.',
    );
  } catch (err) {
    console.error('[INGEST] Ingestion failed:', err);
    process.exit(1);
  } finally {
    await dispose();
  }
}

runCliIngest();
