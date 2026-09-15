import {
  createStartHandler,
  defaultStreamHandler,
} from '@tanstack/react-start/server';
import type {
  ScheduledEvent,
  ExecutionContext,
} from '@cloudflare/workers-types';
import { handleScheduled } from './cron';
import type { CloudflareEnv } from '../types/env';

export { FixtureSyncWorkflow } from './workflows/fixture-sync';

/**
 * Default TanStack Start HTTP request handler.
 * Handles SSR, streaming HTML responses, client RPC server functions,
 * and server API file routes.
 */
interface StartServerContext {
  server: {
    requestContext: {
      env: CloudflareEnv;
      ctx: ExecutionContext;
    };
  };
}

const fetchHandler =
  createStartHandler<StartServerContext>(defaultStreamHandler);

export default {
  /**
   * Dispatches incoming HTTP requests to TanStack Start's request pipeline.
   */
  async fetch(
    request: Request,
    env: CloudflareEnv,
    ctx: ExecutionContext,
  ): Promise<Response> {
    return await fetchHandler(request, {
      context: {
        env,
        ctx,
      },
    });
  },

  /**
   * Dispatches Cloudflare Workers scheduled cron triggers to the ingestion pipeline.
   */
  async scheduled(
    event: ScheduledEvent,
    env: CloudflareEnv,
    ctx: ExecutionContext,
  ): Promise<void> {
    await handleScheduled(event, env, ctx);
  },
};
