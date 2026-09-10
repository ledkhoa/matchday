import { describe, it, expect } from 'bun:test';
import {
  parseRedditTitle,
  generateMatchId,
  generateGoalFingerprint,
} from './parser';

describe('parseRedditTitle', () => {
  it('parses standard title with home score bracket', () => {
    const result = parseRedditTitle(
      "Arsenal [1] - 0 Chelsea - Bukayo Saka 45'",
    );
    expect(result).toEqual({
      teamHome: 'Arsenal',
      teamAway: 'Chelsea',
      scoreHome: 1,
      scoreAway: 0,
      scorer: 'Bukayo Saka',
      minute: "45'",
      tag: null,
    });
  });

  it('parses away bracketed score and stoppage time minute', () => {
    const result = parseRedditTitle(
      "Arsenal 1 - [1] Chelsea - Cole Palmer 45+1'",
    );
    expect(result).toEqual({
      teamHome: 'Arsenal',
      teamAway: 'Chelsea',
      scoreHome: 1,
      scoreAway: 1,
      scorer: 'Cole Palmer',
      minute: "45+1'",
      tag: null,
    });
  });

  it('parses both brackets on scores', () => {
    const result = parseRedditTitle(
      "Arsenal [2] - [1] Chelsea - Martinelli 60'",
    );
    expect(result).toEqual({
      teamHome: 'Arsenal',
      teamAway: 'Chelsea',
      scoreHome: 2,
      scoreAway: 1,
      scorer: 'Martinelli',
      minute: "60'",
      tag: null,
    });
  });

  it('parses unbracketed scores', () => {
    const result = parseRedditTitle("Arsenal 1 - 0 Chelsea - Bukayo Saka 45'");
    expect(result).toEqual({
      teamHome: 'Arsenal',
      teamAway: 'Chelsea',
      scoreHome: 1,
      scoreAway: 0,
      scorer: 'Bukayo Saka',
      minute: "45'",
      tag: null,
    });
  });

  it("parses stoppage time minutes like 90+4'", () => {
    const result = parseRedditTitle("Liverpool [3] - 2 Man City - Salah 90+4'");
    expect(result).toEqual({
      teamHome: 'Liverpool',
      teamAway: 'Man City',
      scoreHome: 3,
      scoreAway: 2,
      scorer: 'Salah',
      minute: "90+4'",
      tag: null,
    });
  });

  it('extracts trailing parenthesized tag like (Great Goal)', () => {
    const result = parseRedditTitle(
      "Real Madrid [3] - 2 Barca - Vinicius 90' (Great Goal)",
    );
    expect(result).toEqual({
      teamHome: 'Real Madrid',
      teamAway: 'Barca',
      scoreHome: 3,
      scoreAway: 2,
      scorer: 'Vinicius',
      minute: "90'",
      tag: 'Great Goal',
    });
  });

  it('extracts trailing penalty tag', () => {
    const result = parseRedditTitle(
      "Bayern [1] - 0 Dortmund - Kane 14' (Penalty)",
    );
    expect(result).toEqual({
      teamHome: 'Bayern',
      teamAway: 'Dortmund',
      scoreHome: 1,
      scoreAway: 0,
      scorer: 'Kane',
      minute: "14'",
      tag: 'Penalty',
    });
  });

  it("extracts tag positioned before minute like Saka (P) 22'", () => {
    const result = parseRedditTitle("Arsenal [1] - 0 Chelsea - Saka (P) 22'");
    expect(result).toEqual({
      teamHome: 'Arsenal',
      teamAway: 'Chelsea',
      scoreHome: 1,
      scoreAway: 0,
      scorer: 'Saka',
      minute: "22'",
      tag: 'P',
    });
  });

  it('handles en-dash and em-dash separators', () => {
    const result = parseRedditTitle(
      "Arsenal [1] – 0 Chelsea — Bukayo Saka 45'",
    );
    expect(result).toEqual({
      teamHome: 'Arsenal',
      teamAway: 'Chelsea',
      scoreHome: 1,
      scoreAway: 0,
      scorer: 'Bukayo Saka',
      minute: "45'",
      tag: null,
    });
  });

  it('handles titles with invisible zero-width and directional unicode characters', () => {
    // Contains \u200e (left-to-right mark) around the minute apostrophe
    const result = parseRedditTitle(
      "Chelsea 4 - [3] Leeds United - Dominic Calvert-Lewin 75\u200e'\u200e",
    );
    expect(result).toEqual({
      teamHome: 'Chelsea',
      teamAway: 'Leeds United',
      scoreHome: 4,
      scoreAway: 3,
      scorer: 'Dominic Calvert-Lewin',
      minute: "75'",
      tag: null,
    });
  });

  it('rejects match threads', () => {
    expect(parseRedditTitle('Match Thread: Arsenal vs Chelsea')).toBeNull();
  });

  it('rejects post-match threads', () => {
    expect(
      parseRedditTitle('Post Match Thread: Arsenal 1-0 Chelsea'),
    ).toBeNull();
    expect(
      parseRedditTitle('[Post-Match Thread] Arsenal 1 - 0 Chelsea'),
    ).toBeNull();
  });

  it('rejects journalist quotes and transfer news', () => {
    expect(
      parseRedditTitle('[Fabrizio Romano] Deal signed for player.'),
    ).toBeNull();
    expect(
      parseRedditTitle('Jurgen Klopp post-match interview quotes'),
    ).toBeNull();
    expect(parseRedditTitle('Daily Discussion')).toBeNull();
    expect(parseRedditTitle('Transfer Round-up')).toBeNull();
    expect(parseRedditTitle('Pre-Match Thread: Arsenal vs Chelsea')).toBeNull();
    expect(
      parseRedditTitle('[Pre-Match Thread] Arsenal vs Chelsea'),
    ).toBeNull();
  });

  it('handles unicode prime in minute', () => {
    const result = parseRedditTitle('Liverpool [1] - 0 Everton - Salah 90′');
    expect(result).toEqual({
      teamHome: 'Liverpool',
      teamAway: 'Everton',
      scoreHome: 1,
      scoreAway: 0,
      scorer: 'Salah',
      minute: '90′',
      tag: null,
    });
  });

  it('handles stoppage time and minutes without quotes', () => {
    const result1 = parseRedditTitle('Arsenal [1] - 0 Chelsea - Saka 45+2');
    expect(result1?.minute).toBe('45+2');

    const result2 = parseRedditTitle('Arsenal [1] - 0 Chelsea - Saka 45');
    expect(result2?.minute).toBe('45');
  });

  it('handles team names with numbers and hyphenated player names', () => {
    const result = parseRedditTitle(
      "Schalke 04 [2] - 1 Mainz 05 - Jean-Paul Boëtius 88'",
    );
    expect(result).toEqual({
      teamHome: 'Schalke 04',
      teamAway: 'Mainz 05',
      scoreHome: 2,
      scoreAway: 1,
      scorer: 'Jean-Paul Boëtius',
      minute: "88'",
      tag: null,
    });
  });

  it('extracts own goal tags (OG)', () => {
    const result = parseRedditTitle(
      "Arsenal [1] - 0 Chelsea - Disasi 15' (OG)",
    );
    expect(result).toEqual({
      teamHome: 'Arsenal',
      teamAway: 'Chelsea',
      scoreHome: 1,
      scoreAway: 0,
      scorer: 'Disasi',
      minute: "15'",
      tag: 'OG',
    });
  });

  it('rejects malformed scores and non-numeric score patterns', () => {
    expect(parseRedditTitle('Arsenal abc - def Chelsea - Saka 45')).toBeNull();
    expect(parseRedditTitle('Arsenal - Chelsea - Saka 45')).toBeNull();
    expect(parseRedditTitle('Arsenal vs Chelsea')).toBeNull();
    expect(parseRedditTitle('')).toBeNull();
    expect(parseRedditTitle('   ')).toBeNull();
  });
});

describe('generateMatchId', () => {
  it('produces identical match ID regardless of team argument order', () => {
    const id1 = generateMatchId('2026-09-09', 'Arsenal', 'Chelsea');
    const id2 = generateMatchId('2026-09-09', 'Chelsea', 'Arsenal');
    expect(id1).toBe('2026-09-09_arsenal_chelsea');
    expect(id2).toBe('2026-09-09_arsenal_chelsea');
  });

  it('normalizes special characters and accents', () => {
    const matchId = generateMatchId(
      '2026-09-09',
      'Bayern München',
      'Borussia Dortmund',
    );
    expect(matchId).toBe('2026-09-09_bayernmnchen_borussiadortmund');
  });

  it('normalizes hyphens, ampersands, and extra spaces in team names', () => {
    const matchId1 = generateMatchId(
      '2026-09-09',
      'Paris Saint-Germain',
      'Atlético Madrid',
    );
    const matchId2 = generateMatchId(
      '2026-09-09',
      'Brighton & Hove Albion',
      'Wolverhampton Wanderers',
    );
    expect(matchId1).toBe('2026-09-09_atlticomadrid_parissaintgermain');
    expect(matchId2).toBe(
      '2026-09-09_brightonhovealbion_wolverhamptonwanderers',
    );
  });
});

describe('generateGoalFingerprint', () => {
  it('generates fingerprint for standard regulation goal', () => {
    const fp = generateGoalFingerprint('2026-09-09_chelsea_leeds', "22'", 2, 0);
    expect(fp).toBe('2026-09-09_chelsea_leeds_m22_h2_a0');
  });

  it('generates fingerprint for stoppage time minutes like 90+4', () => {
    const fp = generateGoalFingerprint(
      '2026-09-09_chelsea_leeds',
      "90'+4'",
      6,
      3,
    );
    expect(fp).toBe('2026-09-09_chelsea_leeds_m904_h6_a3');
  });

  it('generates fingerprint with empty minute if minute is null', () => {
    const fp = generateGoalFingerprint('2026-09-09_chelsea_leeds', null, 1, 0);
    expect(fp).toBe('2026-09-09_chelsea_leeds_m_h1_a0');
  });

  it('returns null if either home or away score is null', () => {
    expect(
      generateGoalFingerprint('2026-09-09_chelsea_leeds', "12'", null, 0),
    ).toBeNull();
    expect(
      generateGoalFingerprint('2026-09-09_chelsea_leeds', "12'", 1, null),
    ).toBeNull();
  });
});
