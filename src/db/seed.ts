import { getPlatformProxy } from 'wrangler';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';
import type { CloudflareEnv } from '../types/env';
import { generateMatchId } from '../lib/parser';
import { resolveVideoEmbed } from '../lib/video';

interface SeedItem {
  id: string;
  title: string;
  teamHome: string;
  teamAway: string;
  scoreHome: number;
  scoreAway: number;
  scorer: string;
  minute: string;
  tag: string | null;
  sourceUrl: string;
  redditUrl: string;
  redditScore: number;
  createdUtc: number;
}

const SEED_HIGHLIGHTS: SeedItem[] = [
  {
    id: 't3_1wbrm70',
    title: "Barcelona [2] - 0 Feyenoord - Karim Adeyemi 22' (Great Goal)",
    teamHome: 'Barcelona',
    teamAway: 'Feyenoord',
    scoreHome: 2,
    scoreAway: 0,
    scorer: 'Karim Adeyemi',
    minute: "22'",
    tag: 'Great Goal',
    sourceUrl: 'https://streamin.link/v/b05cef59',
    redditUrl:
      'https://www.reddit.com/r/soccer/comments/1wbrm70/barcelona_2_0_feyenoord_karim_adeyemi_22_great/',
    redditScore: 3103,
    createdUtc: 1788973765,
  },
  {
    id: 't3_1wbyjhs',
    title: "Chelsea [6]-3 Leeds - Danny Welbeck 90'+4'",
    teamHome: 'Chelsea',
    teamAway: 'Leeds',
    scoreHome: 6,
    scoreAway: 3,
    scorer: 'Danny Welbeck',
    minute: "90'+4'",
    tag: null,
    sourceUrl: 'https://streamain.com/en/NzwSmy4S1oaJDOh/watch',
    redditUrl:
      'https://www.reddit.com/r/soccer/comments/1wbyjhs/chelsea_63_leeds_danny_welbeck_904/',
    redditScore: 522,
    createdUtc: 1788988404,
  },
];

async function seed() {
  const proxy = await getPlatformProxy<CloudflareEnv>();
  const { env, dispose } = proxy;

  try {
    const db = drizzle(env.DB, { schema });
    const today = new Date().toISOString().slice(0, 10);

    console.log(
      `[SEED] Cleaning existing database records and seeding date: ${today}`,
    );

    // Delete existing records to ensure clean state with only authentic links
    await db.delete(schema.highlights);
    await db.delete(schema.matches);

    for (const item of SEED_HIGHLIGHTS) {
      const matchId = generateMatchId(today, item.teamHome, item.teamAway);
      const media = resolveVideoEmbed(item.sourceUrl);
      const now = Date.now();

      await db
        .insert(schema.matches)
        .values({
          id: matchId,
          matchDate: today,
          teamHome: item.teamHome,
          teamAway: item.teamAway,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: schema.matches.id,
          set: {
            matchDate: today,
            teamHome: item.teamHome,
            teamAway: item.teamAway,
            updatedAt: now,
          },
        });

      await db
        .insert(schema.highlights)
        .values({
          id: item.id,
          matchId,
          title: item.title,
          scoreHome: item.scoreHome,
          scoreAway: item.scoreAway,
          scorer: item.scorer,
          minute: item.minute,
          tag: item.tag,
          embedUrl: media.embedUrl,
          sourceUrl: item.sourceUrl,
          redditUrl: item.redditUrl,
          redditScore: item.redditScore,
          postedAt: item.createdUtc * 1000,
        })
        .onConflictDoUpdate({
          target: schema.highlights.id,
          set: {
            title: item.title,
            scoreHome: item.scoreHome,
            scoreAway: item.scoreAway,
            scorer: item.scorer,
            minute: item.minute,
            tag: item.tag,
            embedUrl: media.embedUrl,
            sourceUrl: item.sourceUrl,
            redditUrl: item.redditUrl,
            redditScore: item.redditScore,
            postedAt: item.createdUtc * 1000,
          },
        });

      console.log(
        `[SEED] Inserted match "${item.teamHome} vs ${item.teamAway}" with highlight "${item.title}"`,
      );
    }

    console.log(
      `[SEED] Seeding completed: 2 matches and 2 highlights inserted.`,
    );
  } catch (error) {
    console.error('[SEED] Database seeding failed:', error);
    process.exit(1);
  } finally {
    await dispose();
  }
}

seed();
