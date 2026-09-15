import { describe, it, expect } from 'bun:test';
import {
  SUPPORTED_LEAGUES_LIST,
  SUPPORTED_LEAGUE_NAMES,
  isSupportedLeague,
} from './leagues';

describe('leagues utility', () => {
  it('contains exactly 15 supported leagues', () => {
    expect(SUPPORTED_LEAGUES_LIST.length).toBe(15);
    expect(SUPPORTED_LEAGUE_NAMES.length).toBe(15);
  });

  it('includes key premier competitions', () => {
    expect(SUPPORTED_LEAGUE_NAMES).toContain('Premier League');
    expect(SUPPORTED_LEAGUE_NAMES).toContain('Championship');
    expect(SUPPORTED_LEAGUE_NAMES).toContain('UEFA Champions League');
    expect(SUPPORTED_LEAGUE_NAMES).toContain('La Liga');
    expect(SUPPORTED_LEAGUE_NAMES).toContain('Bundesliga');
    expect(SUPPORTED_LEAGUE_NAMES).toContain('Serie A');
    expect(SUPPORTED_LEAGUE_NAMES).toContain('Ligue 1');
    expect(SUPPORTED_LEAGUE_NAMES).toContain('Major League Soccer');
  });

  it('isSupportedLeague returns true for tracked leagues', () => {
    expect(isSupportedLeague('Premier League')).toBe(true);
    expect(isSupportedLeague('Championship')).toBe(true);
    expect(isSupportedLeague('EFL Championship')).toBe(true);
    expect(isSupportedLeague('League Cup')).toBe(true);
    expect(isSupportedLeague('EFL Cup')).toBe(true);
    expect(isSupportedLeague('Major League Soccer')).toBe(true);
  });

  it('isSupportedLeague returns false for untracked or empty values', () => {
    expect(isSupportedLeague('Scottish Premiership')).toBe(false);
    expect(isSupportedLeague(null)).toBe(false);
    expect(isSupportedLeague(undefined)).toBe(false);
    expect(isSupportedLeague('')).toBe(false);
  });
});
