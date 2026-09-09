import { drizzle } from 'drizzle-orm/d1';
import type { D1Database } from '@cloudflare/workers-types';
import * as schema from './schema';

/**
 * Initializes a typed Drizzle ORM client instance from a Cloudflare D1 binding.
 * Cloudflare Workers instantiate D1 bindings on the request context rather than
 * as a static global connection.
 */
export function createDb(d1: D1Database) {
  return drizzle(d1, { schema });
}

export type Database = ReturnType<typeof createDb>;

export * from './schema';
