import fs from 'node:fs';
import path from 'node:path';
import { getPlatformProxy } from 'wrangler';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';
import type { CloudflareEnv } from '../types/env';
import {
  generateMatchId,
  parseRedditTitle,
  generateGoalFingerprint,
} from '../lib/parser';
import { resolveVideoEmbed } from '../lib/video';

interface ScrapedPost {
  id: string;
  title: string;
  url: string;
  domain: string;
  score: number;
  permalink: string;
  createdTimestamp: string;
}

function extractRedditId(post: ScrapedPost): string {
  if (post.id && post.id.startsWith('t3_')) {
    return post.id;
  }
  const match = post.permalink.match(/\/comments\/([a-z0-9]+)/i);
  if (match && match[1]) {
    return `t3_${match[1]}`;
  }
  return post.id;
}

async function seed() {
  const proxy = await getPlatformProxy<CloudflareEnv>();
  const { env, dispose } = proxy;

  try {
    const db = drizzle(env.DB, { schema });
    const scrapedFile = path.resolve(process.cwd(), 'scraped_100_posts.json');

    if (!fs.existsSync(scrapedFile)) {
      console.error(
        `[SEED] Scraped data file not found at ${scrapedFile}. Please run scraper first.`,
      );
      process.exit(1);
    }

    const rawData = fs.readFileSync(scrapedFile, 'utf-8');
    const posts: ScrapedPost[] = JSON.parse(rawData);

    console.log(
      `[SEED] Loaded ${posts.length} scraped posts. Parsing and preparing database records...`,
    );

    const now = Date.now();
    const matchMap = new Map<string, schema.NewMatch>();
    const highlightList: schema.NewHighlight[] = [];
    let skippedCount = 0;

    for (const post of posts) {
      const parsed = parseRedditTitle(post.title);
      if (!parsed) {
        skippedCount++;
        continue;
      }

      const postDate = new Date(post.createdTimestamp);
      const matchDate = postDate.toISOString().slice(0, 10);
      const matchId = generateMatchId(
        matchDate,
        parsed.teamHome,
        parsed.teamAway,
      );

      if (!matchMap.has(matchId)) {
        matchMap.set(matchId, {
          id: matchId,
          matchDate,
          teamHome: parsed.teamHome,
          teamAway: parsed.teamAway,
          createdAt: now,
          updatedAt: now,
        });
      }

      const media = resolveVideoEmbed(post.url, post.permalink);
      const highlightId = extractRedditId(post);
      const fingerprint = generateGoalFingerprint(
        matchId,
        parsed.minute,
        parsed.scoreHome,
        parsed.scoreAway,
      );

      highlightList.push({
        id: highlightId,
        matchId,
        title: post.title,
        scoreHome: parsed.scoreHome,
        scoreAway: parsed.scoreAway,
        scorer: parsed.scorer,
        minute: parsed.minute,
        tag: parsed.tag,
        embedUrl: media.embedUrl,
        sourceUrl: post.url,
        redditUrl: post.permalink,
        goalFingerprint: fingerprint,
        postedAt: postDate.getTime(),
      });
    }

    console.log(
      `[SEED] Parsed ${highlightList.length} goal highlights across ${matchMap.size} unique matches (${skippedCount} non-scoreline posts skipped).`,
    );

    // Clean existing database records
    await db.delete(schema.highlights);
    await db.delete(schema.matches);

    // Insert matches row-by-row to respect SQLite variable limit
    const matchesArray = Array.from(matchMap.values());
    for (const match of matchesArray) {
      await db.insert(schema.matches).values(match).onConflictDoNothing();
    }

    // Insert highlights row-by-row to respect SQLite variable limit
    for (const highlight of highlightList) {
      await db
        .insert(schema.highlights)
        .values(highlight)
        .onConflictDoNothing();
    }

    console.log(
      `[SEED] Successfully seeded ${matchesArray.length} matches and ${highlightList.length} highlights into Cloudflare D1!`,
    );
  } catch (error) {
    console.error('[SEED] Database seeding failed:', error);
    process.exit(1);
  } finally {
    await dispose();
  }
}

seed();
