import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

export const matches = sqliteTable(
  'matches',
  {
    id: text('id').primaryKey(),
    matchDate: text('match_date').notNull(),
    teamHome: text('team_home').notNull(),
    teamAway: text('team_away').notNull(),
    createdAt: integer('created_at', { mode: 'number' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'number' }).notNull(),
  },
  (table) => [index('matches_match_date_idx').on(table.matchDate)],
);

export const highlights = sqliteTable(
  'highlights',
  {
    id: text('id').primaryKey(),
    matchId: text('match_id')
      .notNull()
      .references(() => matches.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    scoreHome: integer('score_home'),
    scoreAway: integer('score_away'),
    scorer: text('scorer'),
    minute: text('minute'),
    tag: text('tag'),
    embedUrl: text('embed_url'),
    sourceUrl: text('source_url').notNull(),
    redditUrl: text('reddit_url').notNull(),
    goalFingerprint: text('goal_fingerprint'),
    postedAt: integer('posted_at', { mode: 'number' }).notNull(),
  },
  (table) => [
    index('highlights_match_id_idx').on(table.matchId),
    index('highlights_goal_fingerprint_idx').on(table.goalFingerprint),
  ],
);

export const matchesRelations = relations(matches, ({ many }) => ({
  highlights: many(highlights),
}));

export const highlightsRelations = relations(highlights, ({ one }) => ({
  match: one(matches, {
    fields: [highlights.matchId],
    references: [matches.id],
  }),
}));

export type Match = typeof matches.$inferSelect;
export type NewMatch = typeof matches.$inferInsert;

export type Highlight = typeof highlights.$inferSelect;
export type NewHighlight = typeof highlights.$inferInsert;

export interface MatchWithHighlights extends Match {
  highlights: Highlight[];
}

export interface HighlightWithMatch extends Highlight {
  match?: Match;
}
