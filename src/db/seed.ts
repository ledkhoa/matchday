import { getPlatformProxy } from 'wrangler';
import { drizzle } from 'drizzle-orm/d1';
import { faker } from '@faker-js/faker';
import * as schema from './schema';
import type { CloudflareEnv } from '../types/env';

interface FixtureDefinition {
  teamHome: string;
  teamAway: string;
  goals: Array<{
    scorer: string;
    minute: string;
    tag?: string;
    scoringTeam: 'home' | 'away';
  }>;
}

const FIXTURES_BY_DAY: FixtureDefinition[][] = [
  // Day T-2: El Clásico, London Derby, Der Klassiker, Derby d'Italia
  [
    {
      teamHome: 'Real Madrid',
      teamAway: 'Barcelona',
      goals: [
        {
          scorer: 'Vinicius Junior',
          minute: "14'",
          tag: 'Great Goal',
          scoringTeam: 'home',
        },
        {
          scorer: 'Robert Lewandowski',
          minute: "38'",
          tag: 'Penalty',
          scoringTeam: 'away',
        },
        {
          scorer: 'Jude Bellingham',
          minute: "90+1'",
          tag: 'Great Goal',
          scoringTeam: 'home',
        },
      ],
    },
    {
      teamHome: 'Arsenal',
      teamAway: 'Chelsea',
      goals: [
        { scorer: 'Bukayo Saka', minute: "22'", scoringTeam: 'home' },
        {
          scorer: 'Cole Palmer',
          minute: "45+1'",
          tag: 'Penalty',
          scoringTeam: 'away',
        },
      ],
    },
    {
      teamHome: 'Bayern Munich',
      teamAway: 'Borussia Dortmund',
      goals: [
        { scorer: 'Harry Kane', minute: "9'", scoringTeam: 'home' },
        {
          scorer: 'Harry Kane',
          minute: "54'",
          tag: 'Great Goal',
          scoringTeam: 'home',
        },
        { scorer: 'Julian Brandt', minute: "72'", scoringTeam: 'away' },
      ],
    },
    {
      teamHome: 'Inter Milan',
      teamAway: 'Juventus',
      goals: [
        { scorer: 'Lautaro Martínez', minute: "33'", scoringTeam: 'home' },
        { scorer: 'Dušan Vlahović', minute: "81'", scoringTeam: 'away' },
      ],
    },
  ],
  // Day T-1: Premier League & European Heavyweights
  [
    {
      teamHome: 'Liverpool',
      teamAway: 'Manchester City',
      goals: [
        {
          scorer: 'Mohamed Salah',
          minute: "18'",
          tag: 'Great Goal',
          scoringTeam: 'home',
        },
        { scorer: 'Erling Haaland', minute: "62'", scoringTeam: 'away' },
      ],
    },
    {
      teamHome: 'Paris Saint-Germain',
      teamAway: 'Marseille',
      goals: [
        { scorer: 'Bradley Barcola', minute: "27'", scoringTeam: 'home' },
        {
          scorer: 'Ousmane Dembélé',
          minute: "74'",
          tag: 'Great Goal',
          scoringTeam: 'home',
        },
      ],
    },
    {
      teamHome: 'Atletico Madrid',
      teamAway: 'Sevilla',
      goals: [
        { scorer: 'Antoine Griezmann', minute: "41'", scoringTeam: 'home' },
      ],
    },
    {
      teamHome: 'AC Milan',
      teamAway: 'AS Roma',
      goals: [
        {
          scorer: 'Rafael Leão',
          minute: "15'",
          tag: 'Great Goal',
          scoringTeam: 'home',
        },
        {
          scorer: 'Paulo Dybala',
          minute: "68'",
          tag: 'Penalty',
          scoringTeam: 'away',
        },
      ],
    },
  ],
  // Day T: Today's Featured Fixtures
  [
    {
      teamHome: 'Tottenham Hotspur',
      teamAway: 'Manchester United',
      goals: [
        { scorer: 'Son Heung-min', minute: "11'", scoringTeam: 'home' },
        {
          scorer: 'Bruno Fernandes',
          minute: "58'",
          tag: 'Penalty',
          scoringTeam: 'away',
        },
        {
          scorer: 'James Maddison',
          minute: "84'",
          tag: 'Great Goal',
          scoringTeam: 'home',
        },
      ],
    },
    {
      teamHome: 'Bayer Leverkusen',
      teamAway: 'RB Leipzig',
      goals: [
        {
          scorer: 'Florian Wirtz',
          minute: "30'",
          tag: 'Great Goal',
          scoringTeam: 'home',
        },
        { scorer: 'Benjamin Šeško', minute: "78'", scoringTeam: 'away' },
      ],
    },
    {
      teamHome: 'Napoli',
      teamAway: 'Lazio',
      goals: [
        { scorer: 'Khvicha Kvaratskhelia', minute: "44'", scoringTeam: 'home' },
      ],
    },
    {
      teamHome: 'Sporting CP',
      teamAway: 'Benfica',
      goals: [
        { scorer: 'Viktor Gyökeres', minute: "25'", scoringTeam: 'home' },
        {
          scorer: 'Viktor Gyökeres',
          minute: "69'",
          tag: 'Great Goal',
          scoringTeam: 'home',
        },
        {
          scorer: 'Ángel Di María',
          minute: "88'",
          tag: 'Penalty',
          scoringTeam: 'away',
        },
      ],
    },
  ],
];

const VIDEO_PROVIDERS = [
  {
    domain: 'dubz.co',
    sourceUrl: (id: string) => `https://dubz.co/c/${id}`,
    embedUrl: (id: string) => `https://dubz.co/e/${id}`,
  },
  {
    domain: 'streamin.one',
    sourceUrl: (id: string) => `https://streamin.one/v/${id}`,
    embedUrl: (id: string) => `https://streamin.one/e/${id}`,
  },
  {
    domain: 'v.redd.it',
    sourceUrl: (id: string) => `https://v.redd.it/${id}`,
    embedUrl: (id: string) => `https://v.redd.it/${id}/DASH_720.mp4`,
  },
];

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

async function seed() {
  const proxy = await getPlatformProxy<CloudflareEnv>();
  const { env, dispose } = proxy;

  try {
    const db = drizzle(env.DB, { schema });
    const now = new Date();

    // 3 distinct dates: T-2, T-1, T
    const targetDates = [
      new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
      new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
      now,
    ].map(formatIsoDate);

    console.log(
      `Starting database seed across 3 dates: ${targetDates.join(', ')}`,
    );

    let totalMatches = 0;
    let totalHighlights = 0;

    for (let dayIndex = 0; dayIndex < targetDates.length; dayIndex++) {
      const matchDate = targetDates[dayIndex];
      const fixtures = FIXTURES_BY_DAY[dayIndex];

      for (const fixture of fixtures) {
        const homeSlug = slugify(fixture.teamHome);
        const awaySlug = slugify(fixture.teamAway);
        const matchId = `${matchDate}_${homeSlug}_${awaySlug}`;
        const baseTimestamp = new Date(`${matchDate}T15:00:00Z`).getTime();

        const matchRecord: schema.NewMatch = {
          id: matchId,
          matchDate,
          teamHome: fixture.teamHome,
          teamAway: fixture.teamAway,
          createdAt: baseTimestamp,
          updatedAt: baseTimestamp,
        };

        await db
          .insert(schema.matches)
          .values(matchRecord)
          .onConflictDoUpdate({
            target: schema.matches.id,
            set: {
              matchDate: matchRecord.matchDate,
              teamHome: matchRecord.teamHome,
              teamAway: matchRecord.teamAway,
              updatedAt: matchRecord.updatedAt,
            },
          });

        totalMatches++;

        let currentHomeScore = 0;
        let currentAwayScore = 0;

        for (let goalIndex = 0; goalIndex < fixture.goals.length; goalIndex++) {
          const goal = fixture.goals[goalIndex];
          if (goal.scoringTeam === 'home') {
            currentHomeScore++;
          } else {
            currentAwayScore++;
          }

          const highlightId = `t3_${homeSlug}_${awaySlug}_g${goalIndex + 1}`;
          const provider = VIDEO_PROVIDERS[goalIndex % VIDEO_PROVIDERS.length];
          const clipToken = `${homeSlug}${awaySlug}${goalIndex + 1}`;
          const sourceUrl = provider.sourceUrl(clipToken);
          const embedUrl = provider.embedUrl(clipToken);

          const titleScore = `[${currentHomeScore}] - ${currentAwayScore}`;
          const goalTitle = `${fixture.teamHome} ${titleScore} ${fixture.teamAway} - ${goal.scorer} ${goal.minute}${goal.tag ? ` (${goal.tag})` : ''}`;

          const highlightRecord: schema.NewHighlight = {
            id: highlightId,
            matchId,
            title: goalTitle,
            scoreHome: currentHomeScore,
            scoreAway: currentAwayScore,
            scorer: goal.scorer,
            minute: goal.minute,
            tag: goal.tag ?? null,
            embedUrl,
            sourceUrl,
            redditUrl: `https://www.reddit.com/r/soccer/comments/${clipToken}/${slugify(goalTitle)}/`,
            redditScore: faker.number.int({ min: 150, max: 8500 }),
            postedAt: baseTimestamp + (goalIndex + 1) * 15 * 60 * 1000,
          };

          await db
            .insert(schema.highlights)
            .values(highlightRecord)
            .onConflictDoUpdate({
              target: schema.highlights.id,
              set: {
                title: highlightRecord.title,
                scoreHome: highlightRecord.scoreHome,
                scoreAway: highlightRecord.scoreAway,
                scorer: highlightRecord.scorer,
                minute: highlightRecord.minute,
                tag: highlightRecord.tag,
                embedUrl: highlightRecord.embedUrl,
                sourceUrl: highlightRecord.sourceUrl,
                redditUrl: highlightRecord.redditUrl,
                redditScore: highlightRecord.redditScore,
                postedAt: highlightRecord.postedAt,
              },
            });

          totalHighlights++;
        }
      }
    }

    console.log(
      `Seeding completed successfully: inserted/updated ${totalMatches} matches and ${totalHighlights} highlights across 3 dates.`,
    );
  } finally {
    await dispose();
  }
}

await seed();
