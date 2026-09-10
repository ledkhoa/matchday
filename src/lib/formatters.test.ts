import { describe, it, expect } from 'bun:test';
import {
  computeMatchScore,
  formatGoalScore,
  getTagCategory,
  getTeamInitials,
} from './formatters';
import type { Highlight } from '#/db/schema';

function makeHighlight(partial: Partial<Highlight>): Highlight {
  return {
    id: 'hl-1',
    matchId: 'match-1',
    title: 'Test Goal',
    scoreHome: null,
    scoreAway: null,
    scorer: null,
    minute: null,
    tag: null,
    embedUrl: null,
    sourceUrl: 'https://dubz.co/c/abc',
    redditUrl: '/r/soccer/comments/123/goal',
    goalFingerprint: null,
    postedAt: 1690000000,
    ...partial,
  };
}

describe('formatters', () => {
  describe('computeMatchScore', () => {
    it('returns null when highlights array is empty', () => {
      expect(computeMatchScore([])).toBeNull();
    });

    it('returns null when no highlight has valid home/away scores', () => {
      const hls = [makeHighlight({ scoreHome: null, scoreAway: null })];
      expect(computeMatchScore(hls)).toBeNull();
    });

    it('returns the latest recorded valid score from chronologically sorted highlights', () => {
      const hls = [
        makeHighlight({ id: '1', scoreHome: 1, scoreAway: 0 }),
        makeHighlight({ id: '2', scoreHome: 1, scoreAway: 1 }),
        makeHighlight({ id: '3', scoreHome: 2, scoreAway: 1 }),
      ];
      expect(computeMatchScore(hls)).toEqual({ home: 2, away: 1 });
    });

    it('skips highlights with null scores to find the latest valid score', () => {
      const hls = [
        makeHighlight({ id: '1', scoreHome: 1, scoreAway: 0 }),
        makeHighlight({ id: '2', scoreHome: null, scoreAway: null }),
      ];
      expect(computeMatchScore(hls)).toEqual({ home: 1, away: 0 });
    });
  });

  describe('formatGoalScore', () => {
    it('formats first goal when home scores', () => {
      const hl = makeHighlight({ scoreHome: 1, scoreAway: 0 });
      expect(formatGoalScore(hl)).toBe('[1] - 0');
    });

    it('formats first goal when away scores', () => {
      const hl = makeHighlight({ scoreHome: 0, scoreAway: 1 });
      expect(formatGoalScore(hl)).toBe('0 - [1]');
    });

    it('formats subsequent goals comparing against previous highlight', () => {
      const prev = makeHighlight({ scoreHome: 1, scoreAway: 0 });
      const currentAway = makeHighlight({ scoreHome: 1, scoreAway: 1 });
      expect(formatGoalScore(currentAway, prev)).toBe('1 - [1]');

      const currentHome = makeHighlight({ scoreHome: 2, scoreAway: 1 });
      expect(formatGoalScore(currentHome, currentAway)).toBe('[2] - 1');
    });

    it('infers bracketed score from title when no previous highlight exists', () => {
      const hlHome = makeHighlight({
        title: "Chelsea [6]-3 Leeds - Danny Welbeck 90'+4'",
        scoreHome: 6,
        scoreAway: 3,
      });
      expect(formatGoalScore(hlHome)).toBe('[6] - 3');

      const hlAway = makeHighlight({
        title: "Arsenal 1 - [2] Chelsea - Cole Palmer 77'",
        scoreHome: 1,
        scoreAway: 2,
      });
      expect(formatGoalScore(hlAway)).toBe('1 - [2]');
    });

    it('returns empty string if scores are null', () => {
      const hl = makeHighlight({ scoreHome: null, scoreAway: null });
      expect(formatGoalScore(hl)).toBe('');
    });
  });

  describe('getTagCategory', () => {
    it('categorizes penalties', () => {
      expect(getTagCategory('Penalty')).toBe('penalty');
      expect(getTagCategory('P')).toBe('penalty');
      expect(getTagCategory('(penalty)')).toBe('penalty');
    });

    it('categorizes great goals and wonder strikes', () => {
      expect(getTagCategory('Great Goal')).toBe('great_goal');
      expect(getTagCategory('Great Strike')).toBe('great_goal');
      expect(getTagCategory('Wonder Goal')).toBe('great_goal');
    });

    it('categorizes own goals', () => {
      expect(getTagCategory('OG')).toBe('own_goal');
      expect(getTagCategory('Own Goal')).toBe('own_goal');
    });

    it('returns standard for other tags or empty/null', () => {
      expect(getTagCategory(null)).toBe('standard');
      expect(getTagCategory(undefined)).toBe('standard');
      expect(getTagCategory('')).toBe('standard');
      expect(getTagCategory('Header')).toBe('standard');
    });
  });

  describe('getTeamInitials', () => {
    it('resolves known club abbreviations', () => {
      expect(getTeamInitials('Arsenal')).toBe('ARS');
      expect(getTeamInitials('Brighton')).toBe('BHA');
      expect(getTeamInitials('Brighton and Hove Albion')).toBe('BHA');
      expect(getTeamInitials('Manchester City')).toBe('MCI');
      expect(getTeamInitials('Manchester United')).toBe('MUN');
      expect(getTeamInitials('Liverpool')).toBe('LIV');
      expect(getTeamInitials('Chelsea')).toBe('CHE');
      expect(getTeamInitials('Tottenham')).toBe('TOT');
      expect(getTeamInitials('Real Madrid')).toBe('RMA');
      expect(getTeamInitials('Barcelona')).toBe('BAR');
      expect(getTeamInitials('Bayern Munich')).toBe('BAY');
    });

    it('derives initials from multi-word team names', () => {
      expect(getTeamInitials('Crystal Palace')).toBe('CP');
      expect(getTeamInitials('West Ham United')).toBe('WHU');
      expect(getTeamInitials('Paris Saint Germain')).toBe('PSG');
    });

    it('derives initials from single word team names', () => {
      expect(getTeamInitials('Fulham')).toBe('FUL');
      expect(getTeamInitials('Everton')).toBe('EVE');
    });
  });
});
