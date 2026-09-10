import { describe, it, expect } from 'bun:test';
import {
  normalizeTeamName,
  isCollision,
  calculateTeamSimilarity,
  matchPostToFixture,
  type MatcherCandidate,
} from './matcher';
import { parseRedditTitle } from './parser';

describe('normalizeTeamName', () => {
  it('normalizes common club aliases and nicknames', () => {
    expect(normalizeTeamName('Spurs')).toBe('tottenham');
    expect(normalizeTeamName('Wolves')).toBe('wolverhampton');
    expect(normalizeTeamName('Man Utd')).toBe('manchester united');
    expect(normalizeTeamName('PSG')).toBe('paris saint germain');
    expect(normalizeTeamName('BVB')).toBe('borussia dortmund');
    expect(normalizeTeamName('Atleti')).toBe('atletico madrid');
    expect(normalizeTeamName('Bayern München')).toBe('bayern munich');
  });

  it('normalizes full official club names with suffixes to canonical forms', () => {
    expect(normalizeTeamName('Tottenham Hotspur')).toBe('tottenham');
    expect(normalizeTeamName('Wolverhampton Wanderers')).toBe('wolverhampton');
    expect(normalizeTeamName('FC Bayern München')).toBe('bayern munich');
    expect(normalizeTeamName('Arsenal FC')).toBe('arsenal');
    expect(normalizeTeamName('Chelsea FC')).toBe('chelsea');
    expect(normalizeTeamName('Borussia Dortmund')).toBe('borussia dortmund');
  });

  it('handles accents, hyphens, and diacritics', () => {
    expect(normalizeTeamName('Atlético de Madrid')).toBe('atletico madrid');
    expect(normalizeTeamName('Atlético Madrid')).toBe('atletico madrid');
    expect(normalizeTeamName('Saint-Étienne')).toBe('saint etienne');
    expect(normalizeTeamName('D.C. United')).toBe('dc united');
  });

  it('handles empty or blank names safely', () => {
    expect(normalizeTeamName('')).toBe('');
    expect(normalizeTeamName('   ')).toBe('');
  });
});

describe('Anti-Collision Guards & isCollision', () => {
  it('prevents Manchester City and Manchester United from colliding', () => {
    const manCity = normalizeTeamName('Manchester City');
    const manUtd = normalizeTeamName('Manchester United');

    expect(isCollision(manCity, manUtd)).toBe(true);
    expect(
      calculateTeamSimilarity('Manchester City', 'Manchester United'),
    ).toBe(0.0);
  });

  it('prevents AC Milan and Inter Milan from colliding', () => {
    const acMilan = normalizeTeamName('AC Milan');
    const interMilan = normalizeTeamName('Inter');

    expect(isCollision(acMilan, interMilan)).toBe(true);
    expect(calculateTeamSimilarity('AC Milan', 'Inter Milan')).toBe(0.0);
    expect(calculateTeamSimilarity('Milan', 'Inter')).toBe(0.0);
  });

  it('prevents Real Madrid from colliding with Atletico Madrid, Real Sociedad, and Real Betis', () => {
    expect(calculateTeamSimilarity('Real Madrid', 'Atletico Madrid')).toBe(0.0);
    expect(calculateTeamSimilarity('Real Madrid', 'Atleti')).toBe(0.0);
    expect(calculateTeamSimilarity('Real Madrid', 'Real Sociedad')).toBe(0.0);
    expect(calculateTeamSimilarity('Real Madrid', 'La Real')).toBe(0.0);
    expect(calculateTeamSimilarity('Real Madrid', 'Real Betis')).toBe(0.0);
  });

  it('prevents LAFC and LA Galaxy from colliding', () => {
    expect(calculateTeamSimilarity('LAFC', 'LA Galaxy')).toBe(0.0);
    expect(calculateTeamSimilarity('Los Angeles FC', 'LA Galaxy')).toBe(0.0);
  });

  it('allows same-team stems to match with high confidence', () => {
    expect(isCollision('manchester united', 'manchester united')).toBe(false);
    expect(calculateTeamSimilarity('Manchester United', 'Man Utd')).toBe(1.0);
    expect(calculateTeamSimilarity('Arsenal', 'Arsenal FC')).toBe(1.0);
    expect(calculateTeamSimilarity('Tottenham', 'Spurs')).toBe(1.0);
  });
});

describe('calculateTeamSimilarity', () => {
  it('returns 1.0 for exact alias or name matches', () => {
    expect(calculateTeamSimilarity('Spurs', 'Tottenham Hotspur')).toBe(1.0);
    expect(calculateTeamSimilarity('BVB', 'Borussia Dortmund')).toBe(1.0);
    expect(calculateTeamSimilarity('PSG', 'Paris Saint-Germain')).toBe(1.0);
  });

  it('awards token subset matches high score', () => {
    const score = calculateTeamSimilarity('Bournemouth', 'AFC Bournemouth');
    expect(score).toBeGreaterThanOrEqual(0.9);
  });

  it('scores unrelated teams below matching threshold', () => {
    expect(calculateTeamSimilarity('Arsenal', 'Chelsea')).toBeLessThan(0.6);
    expect(calculateTeamSimilarity('Liverpool', 'Everton')).toBeLessThan(0.6);
  });
});

describe('matchPostToFixture', () => {
  const candidates: MatcherCandidate[] = [
    {
      id: '1001',
      matchDate: '2026-09-10',
      teamHome: 'Arsenal',
      teamAway: 'Chelsea',
      competition: 'Premier League',
    },
    {
      id: '1002',
      matchDate: '2026-09-10',
      teamHome: 'Tottenham Hotspur',
      teamAway: 'Wolverhampton Wanderers',
      competition: 'Premier League',
    },
    {
      id: '1003',
      matchDate: '2026-09-10',
      teamHome: 'Real Madrid',
      teamAway: 'Barcelona',
      competition: 'La Liga',
    },
    {
      id: '1004',
      matchDate: '2026-09-09',
      teamHome: 'Manchester United',
      teamAway: 'Liverpool',
      competition: 'Premier League',
    },
  ];

  it('matches direct orientation with high confidence', () => {
    const result = matchPostToFixture('Arsenal', 'Chelsea', candidates);
    expect(result).not.toBeNull();
    expect(result?.fixture.id).toBe('1001');
    expect(result?.inverted).toBe(false);
    expect(result?.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('matches colloquial aliases to canonical fixture records', () => {
    const result = matchPostToFixture('Spurs', 'Wolves', candidates);
    expect(result).not.toBeNull();
    expect(result?.fixture.id).toBe('1002');
    expect(result?.inverted).toBe(false);
    expect(result?.confidence).toBe(1.0);
  });

  it('matches inverted orientation when home/away are swapped', () => {
    const result = matchPostToFixture('Chelsea', 'Arsenal', candidates);
    expect(result).not.toBeNull();
    expect(result?.fixture.id).toBe('1001');
    expect(result?.inverted).toBe(true);
    expect(result?.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('rejects matches between local rivals protected by collision guards', () => {
    // A post between Man City and Liverpool should NOT match Man Utd vs Liverpool!
    const result = matchPostToFixture('Man City', 'Liverpool', candidates);
    expect(result).toBeNull();
  });

  it('rejects completely untracked matches', () => {
    const result = matchPostToFixture('Sturm Graz', 'Rapid Wien', candidates);
    expect(result).toBeNull();
  });

  it('breaks ties using postDate when scores are equal', () => {
    const multiDayCandidates: MatcherCandidate[] = [
      {
        id: '2001',
        matchDate: '2026-09-09',
        teamHome: 'Arsenal',
        teamAway: 'Chelsea',
      },
      {
        id: '2002',
        matchDate: '2026-09-10',
        teamHome: 'Arsenal',
        teamAway: 'Chelsea',
      },
    ];

    const matchDay10 = matchPostToFixture(
      'Arsenal',
      'Chelsea',
      multiDayCandidates,
      '2026-09-10',
    );
    expect(matchDay10?.fixture.id).toBe('2002');

    const matchDay09 = matchPostToFixture(
      'Arsenal',
      'Chelsea',
      multiDayCandidates,
      '2026-09-09',
    );
    expect(matchDay09?.fixture.id).toBe('2001');
  });

  it('resolves both "Chelsea [6]-3 Leeds" and "Chelsea [3] - 2 Leeds United" to the single canonical fixture', () => {
    const chelseaLeedsFixture: MatcherCandidate = {
      id: 'fixture-chelsea-leeds-101',
      matchDate: '2026-09-10',
      teamHome: 'Chelsea',
      teamAway: 'Leeds United',
      competition: 'Premier League',
    };
    const fixtureCandidates = [chelseaLeedsFixture];

    const parsed1 = parseRedditTitle("Chelsea [6]-3 Leeds - Palmer 90+2'");
    expect(parsed1).not.toBeNull();
    const match1 = matchPostToFixture(
      parsed1!.teamHome,
      parsed1!.teamAway,
      fixtureCandidates,
    );
    expect(match1).not.toBeNull();
    expect(match1?.fixture.id).toBe('fixture-chelsea-leeds-101');

    const parsed2 = parseRedditTitle(
      "Chelsea [3] - 2 Leeds United - Jackson 55'",
    );
    expect(parsed2).not.toBeNull();
    const match2 = matchPostToFixture(
      parsed2!.teamHome,
      parsed2!.teamAway,
      fixtureCandidates,
    );
    expect(match2).not.toBeNull();
    expect(match2?.fixture.id).toBe('fixture-chelsea-leeds-101');
  });

  it('prevents rival collisions from false-positive matches (Man City vs Man Utd, AC Milan vs Inter, Real Madrid vs Atletico Madrid)', () => {
    const derbyCandidates: MatcherCandidate[] = [
      {
        id: 'man-utd-fixture',
        matchDate: '2026-09-10',
        teamHome: 'Manchester United',
        teamAway: 'Everton',
        competition: 'Premier League',
      },
      {
        id: 'inter-fixture',
        matchDate: '2026-09-10',
        teamHome: 'Inter Milan',
        teamAway: 'Juventus',
        competition: 'Serie A',
      },
      {
        id: 'atletico-fixture',
        matchDate: '2026-09-10',
        teamHome: 'Atletico Madrid',
        teamAway: 'Sevilla',
        competition: 'La Liga',
      },
    ];

    // Manchester City vs Everton should NOT match Manchester United vs Everton
    const cityResult = matchPostToFixture(
      'Manchester City',
      'Everton',
      derbyCandidates,
    );
    expect(cityResult).toBeNull();

    // AC Milan vs Juventus should NOT match Inter Milan vs Juventus
    const milanResult = matchPostToFixture(
      'AC Milan',
      'Juventus',
      derbyCandidates,
    );
    expect(milanResult).toBeNull();

    // Real Madrid vs Sevilla should NOT match Atletico Madrid vs Sevilla
    const realResult = matchPostToFixture(
      'Real Madrid',
      'Sevilla',
      derbyCandidates,
    );
    expect(realResult).toBeNull();
  });

  it('matches teams with diacritics and accents correctly against canonical fixtures', () => {
    const internationalCandidates: MatcherCandidate[] = [
      {
        id: 'ucl-fixture-1',
        matchDate: '2026-09-10',
        teamHome: 'Atletico Madrid',
        teamAway: 'Bayern Munich',
        competition: 'UEFA Champions League',
      },
      {
        id: 'ligue1-fixture-2',
        matchDate: '2026-09-10',
        teamHome: 'Saint-Etienne',
        teamAway: 'Paris Saint Germain',
        competition: 'Ligue 1',
      },
    ];

    // "Atlético de Madrid" vs "FC Bayern München"
    const result1 = matchPostToFixture(
      'Atlético de Madrid',
      'FC Bayern München',
      internationalCandidates,
    );
    expect(result1).not.toBeNull();
    expect(result1?.fixture.id).toBe('ucl-fixture-1');

    // "Saint-Étienne" vs "PSG"
    const result2 = matchPostToFixture(
      'Saint-Étienne',
      'PSG',
      internationalCandidates,
    );
    expect(result2).not.toBeNull();
    expect(result2?.fixture.id).toBe('ligue1-fixture-2');
  });

  it('rejects matches between youth/non-senior teams and senior canonical fixtures', () => {
    const seniorChampionsLeagueFixture: MatcherCandidate[] = [
      {
        id: 'ucl-bayern-bodo',
        matchDate: '2026-09-10',
        teamHome: 'Bayern Munich',
        teamAway: 'FK Bodo/Glimt',
        competition: 'UEFA Champions League',
      },
      {
        id: 'ucl-leipzig-como',
        matchDate: '2026-09-10',
        teamHome: 'RB Leipzig',
        teamAway: 'Como',
        competition: 'UEFA Champions League',
      },
    ];

    // Bayern U19 vs Bodo/Glimt U19 should NOT match senior Bayern Munich vs FK Bodo/Glimt
    const youthMatch1 = matchPostToFixture(
      'Bayern U19',
      'Bodo/Glimt U19',
      seniorChampionsLeagueFixture,
    );
    expect(youthMatch1).toBeNull();

    // Como U19 vs RB Leipzig U19 should NOT match senior Leipzig vs Como
    const youthMatch2 = matchPostToFixture(
      'Como U19',
      'RB Leipzig U19',
      seniorChampionsLeagueFixture,
    );
    expect(youthMatch2).toBeNull();

    // Barcelona B vs Real Madrid should NOT match senior El Clasico
    expect(calculateTeamSimilarity('Barcelona B', 'Barcelona')).toBe(0.0);
    expect(calculateTeamSimilarity('Bayern U19', 'Bayern Munich')).toBe(0.0);
    expect(calculateTeamSimilarity('Arsenal Women', 'Arsenal')).toBe(0.0);
    expect(calculateTeamSimilarity('Real Madrid Castilla', 'Real Madrid')).toBe(
      0.0,
    );
  });
});
