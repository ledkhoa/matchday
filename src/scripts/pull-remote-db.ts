import { execSync } from 'node:child_process';
import { existsSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';

const DB_NAME = 'matchday-db';
const DUMP_FILE = resolve(process.cwd(), '.tmp-remote-dump.sql');

function sleep(ms: number): void {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    // synchronous sleep to keep CLI flow sequential
  }
}

function runCommand(
  command: string,
  stepName: string,
  maxRetries = 0,
  retryDelayMs = 3000,
): void {
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    console.log(
      `\n⏳ [${stepName}] Running: ${command}${
        attempt > 1 ? ` (Attempt ${attempt}/${maxRetries + 1})` : ''
      }`,
    );

    try {
      execSync(command, { stdio: 'inherit', env: process.env });
      return;
    } catch (error) {
      if (attempt <= maxRetries) {
        console.warn(
          `\n⚠️ ${stepName} failed on attempt ${attempt}. Retrying in ${retryDelayMs / 1000}s...`,
        );
        sleep(retryDelayMs);
      } else {
        console.error(`\n❌ Error during ${stepName}:`, error);
        console.error('\n💡 Troubleshooting Tips:');
        console.error(
          '  1. Verify Cloudflare authentication: run "bun run wrangler whoami"',
        );
        console.error(
          '  2. If session expired, log in again: run "bun run wrangler login"',
        );
        console.error(
          '  3. Cloudflare D1 exports upload SQL to R2 asynchronously; transient timeouts or API blips may occur. Re-running usually succeeds.',
        );
        cleanup();
        process.exit(1);
      }
    }
  }
}

function cleanup(): void {
  if (existsSync(DUMP_FILE)) {
    console.log(`\n🧹 Cleaning up temporary dump: ${DUMP_FILE}`);
    try {
      unlinkSync(DUMP_FILE);
    } catch {
      // ignore cleanup errors
    }
  }
}

function pullRemoteDatabase(): void {
  console.log('🚀 Starting Cloudflare D1 Remote -> Local database mirror...');

  // Step 1: Export app data (matches & highlights) from remote D1 (with retry for transient Cloudflare R2 timeouts)
  runCommand(
    `bun run wrangler d1 export ${DB_NAME} --remote --no-schema --table=matches --table=highlights --output=${DUMP_FILE} -y`,
    'Step 1/4: Export remote data',
    2,
    3000,
  );

  // Step 2: Ensure local migrations are fully applied
  runCommand(
    `bun run wrangler d1 migrations apply ${DB_NAME} --local`,
    'Step 2/4: Apply local migrations',
  );

  // Step 3: Clear existing local data to allow clean re-import
  runCommand(
    `bun run wrangler d1 execute ${DB_NAME} --local --command="DELETE FROM highlights; DELETE FROM matches;" -y`,
    'Step 3/4: Clear local tables',
  );

  // Step 4: Execute the SQL statements against local D1
  runCommand(
    `bun run wrangler d1 execute ${DB_NAME} --local --file=${DUMP_FILE} -y`,
    'Step 4/4: Import data into local D1',
  );

  // Clean up temp dump file
  cleanup();

  console.log(
    '\n🎉 Local D1 database successfully cloned from remote production!',
  );
  console.log(
    '💡 You can now run "bun run dev" to develop against your local database.',
  );
}

pullRemoteDatabase();
