import { execSync } from 'node:child_process';
import { existsSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';

const DB_NAME = 'matchday-db';
const DUMP_FILE = resolve(process.cwd(), '.tmp-remote-dump.sql');

function runCommand(command: string, stepName: string): void {
  console.log(`\n⏳ [${stepName}] Running: ${command}`);
  try {
    execSync(command, { stdio: 'inherit', env: process.env });
  } catch (error) {
    console.error(`\n❌ Error during ${stepName}:`, error);
    cleanup();
    process.exit(1);
  }
}

function cleanup(): void {
  if (existsSync(DUMP_FILE)) {
    console.log(`\n🧹 Cleaning up temporary dump: ${DUMP_FILE}`);
    unlinkSync(DUMP_FILE);
  }
}

function pullRemoteDatabase(): void {
  console.log('🚀 Starting Cloudflare D1 Remote -> Local database mirror...');

  // Step 1: Export app data (matches & highlights) from remote D1
  runCommand(
    `bunx wrangler d1 export ${DB_NAME} --remote --no-schema --table=matches --table=highlights --output=${DUMP_FILE} -y`,
    'Step 1/3: Export remote data',
  );

  // Step 2: Ensure local migrations are fully applied
  runCommand(
    `bunx wrangler d1 migrations apply ${DB_NAME} --local`,
    'Step 2/4: Apply local migrations',
  );

  // Step 3: Clear existing local data to allow clean re-import
  runCommand(
    `bunx wrangler d1 execute ${DB_NAME} --local --command="DELETE FROM highlights; DELETE FROM matches;" -y`,
    'Step 3/4: Clear local tables',
  );

  // Step 4: Execute the SQL statements against local D1
  runCommand(
    `bunx wrangler d1 execute ${DB_NAME} --local --file=${DUMP_FILE} -y`,
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
