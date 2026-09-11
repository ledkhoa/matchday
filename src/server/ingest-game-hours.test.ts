import { describe, it, expect } from 'bun:test';
import type {
  D1Database,
  D1PreparedStatement,
  D1Result,
  D1ExecResult,
  D1DatabaseSession,
  D1Meta,
} from '@cloudflare/workers-types';
import { hasActiveMatchWindow } from './ingest';

type MetaValue =
  string | number | boolean | undefined | { sql_duration_ms: number };

interface TestMeta extends D1Meta {
  [key: string]: MetaValue;
}

const mockMeta: TestMeta = {
  duration: 0,
  size_after: 0,
  rows_read: 0,
  rows_written: 0,
  last_row_id: 1,
  changed_db: false,
  changes: 1,
};

interface MockMatchRow {
  id: string;
  match_date: string;
  team_home: string;
  team_away: string;
  kickoff_time?: number | null;
  status?: string | null;
}

class TestPreparedStatement implements D1PreparedStatement {
  constructor(
    public readonly query: string,
    public readonly values: unknown[] = [],
    private readonly mockMatches: MockMatchRow[] = [],
  ) {}

  bind(...values: unknown[]): D1PreparedStatement {
    return new TestPreparedStatement(this.query, values, this.mockMatches);
  }

  async first<T>(_colName?: string): Promise<T | null> {
    return null;
  }

  async run<T>(): Promise<D1Result<T>> {
    return {
      success: true,
      meta: mockMeta,
      results: [],
    };
  }

  async all<T>(): Promise<D1Result<T>> {
    return {
      success: true,
      meta: mockMeta,
      results: [],
    };
  }

  raw<T = unknown[]>(options: {
    columnNames: true;
  }): Promise<[string[], ...T[]]>;
  raw<T = unknown[]>(options?: { columnNames?: false }): Promise<T[]>;
  async raw<T = unknown[]>(options?: {
    columnNames?: boolean;
  }): Promise<[string[], ...T[]] | T[]> {
    if (this.query.includes('from "matches"') && this.mockMatches.length > 0) {
      const columns = [
        'id',
        'match_date',
        'kickoff_time',
        'status',
        'team_home',
        'team_away',
      ];
      const rows = this.mockMatches.map((m) => [
        m.id,
        m.match_date,
        m.kickoff_time ?? null,
        m.status ?? null,
        m.team_home,
        m.team_away,
      ]);
      if (options?.columnNames) {
        // SAFETY: D1 raw return contract specifies tuple with column names as first element
        return [columns, ...rows] as [string[], ...T[]];
      }
      // SAFETY: D1 raw return contract specifies array of row arrays
      return rows as T[];
    }
    if (options?.columnNames) {
      return [[]];
    }
    return [];
  }
}

class TestD1Database implements D1Database {
  public mockMatches: MockMatchRow[] = [];
  public shouldFailPrepare = false;

  prepare(query: string): D1PreparedStatement {
    if (this.shouldFailPrepare) {
      throw new Error('D1 connection broken');
    }
    return new TestPreparedStatement(query, [], this.mockMatches);
  }

  async batch<T = unknown>(
    statements: D1PreparedStatement[],
  ): Promise<D1Result<T>[]> {
    return statements.map(() => ({
      success: true,
      meta: mockMeta,
      results: [],
    }));
  }

  async exec(_query: string): Promise<D1ExecResult> {
    return { count: 1, duration: 0 };
  }

  withSession(): D1DatabaseSession {
    throw new Error('Not implemented for test');
  }

  async dump(): Promise<ArrayBuffer> {
    return new ArrayBuffer(0);
  }
}

describe('hasActiveMatchWindow', () => {
  const baseTime = new Date('2026-09-10T15:00:00.000Z').getTime();

  it('returns false when no matches exist in the database', async () => {
    const db = new TestD1Database();
    const result = await hasActiveMatchWindow(db, baseTime);

    expect(result.hasActiveMatches).toBe(false);
    expect(result.activeMatchCount).toBe(0);
    expect(result.activeMatches).toEqual([]);
    expect(result.nextMatch).toBeNull();
  });

  it('returns true when a match kicks off in 10 minutes (within 15m pre-match window)', async () => {
    const db = new TestD1Database();
    const kickoff = baseTime + 10 * 60 * 1000;
    db.mockMatches = [
      {
        id: 'match-1',
        match_date: '2026-09-10',
        team_home: 'Arsenal',
        team_away: 'Chelsea',
        kickoff_time: kickoff,
        status: 'NS',
      },
    ];

    const result = await hasActiveMatchWindow(db, baseTime);
    expect(result.hasActiveMatches).toBe(true);
    expect(result.activeMatchCount).toBe(1);
    expect(result.activeMatches[0].teamHome).toBe('Arsenal');
  });

  it('returns false when next match kicks off in 2 hours and identifies nextMatch', async () => {
    const db = new TestD1Database();
    const kickoff = baseTime + 2 * 60 * 60 * 1000;
    db.mockMatches = [
      {
        id: 'match-2',
        match_date: '2026-09-10',
        team_home: 'Liverpool',
        team_away: 'Everton',
        kickoff_time: kickoff,
        status: 'NS',
      },
    ];

    const result = await hasActiveMatchWindow(db, baseTime);
    expect(result.hasActiveMatches).toBe(false);
    expect(result.activeMatchCount).toBe(0);
    expect(result.nextMatch?.teamHome).toBe('Liverpool');
    expect(result.nextMatch?.kickoffTime).toBe(kickoff);
  });

  it('returns true when a match kicked off 1 hour ago (during live match)', async () => {
    const db = new TestD1Database();
    const kickoff = baseTime - 60 * 60 * 1000;
    db.mockMatches = [
      {
        id: 'match-3',
        match_date: '2026-09-10',
        team_home: 'Real Madrid',
        team_away: 'Barcelona',
        kickoff_time: kickoff,
        status: '2H',
      },
    ];

    const result = await hasActiveMatchWindow(db, baseTime);
    expect(result.hasActiveMatches).toBe(true);
    expect(result.activeMatchCount).toBe(1);
    expect(result.activeMatches[0].id).toBe('match-3');
  });

  it('returns true when a match kicked off 3.5 hours ago (within 4h post-match highlight window)', async () => {
    const db = new TestD1Database();
    const kickoff = baseTime - 3.5 * 60 * 60 * 1000;
    db.mockMatches = [
      {
        id: 'match-4',
        match_date: '2026-09-10',
        team_home: 'Bayern Munich',
        team_away: 'Dortmund',
        kickoff_time: kickoff,
        status: 'FT',
      },
    ];

    const result = await hasActiveMatchWindow(db, baseTime);
    expect(result.hasActiveMatches).toBe(true);
    expect(result.activeMatchCount).toBe(1);
  });

  it('returns false when a match kicked off 5 hours ago (outside 4h window)', async () => {
    const db = new TestD1Database();
    const kickoff = baseTime - 5 * 60 * 60 * 1000;
    db.mockMatches = [
      {
        id: 'match-5',
        match_date: '2026-09-10',
        team_home: 'PSG',
        team_away: 'Marseille',
        kickoff_time: kickoff,
        status: 'FT',
      },
    ];

    const result = await hasActiveMatchWindow(db, baseTime);
    expect(result.hasActiveMatches).toBe(false);
    expect(result.activeMatchCount).toBe(0);
  });

  it('ignores cancelled or postponed matches even if kickoff time is within window', async () => {
    const db = new TestD1Database();
    const kickoff = baseTime + 5 * 60 * 1000;
    db.mockMatches = [
      {
        id: 'match-postponed',
        match_date: '2026-09-10',
        team_home: 'Juventus',
        team_away: 'Inter',
        kickoff_time: kickoff,
        status: 'PST',
      },
      {
        id: 'match-cancelled',
        match_date: '2026-09-10',
        team_home: 'Milan',
        team_away: 'Roma',
        kickoff_time: kickoff,
        status: 'CANC',
      },
    ];

    const result = await hasActiveMatchWindow(db, baseTime);
    expect(result.hasActiveMatches).toBe(false);
    expect(result.activeMatchCount).toBe(0);
  });

  it('handles database error gracefully by returning hasActiveMatches: false', async () => {
    const db = new TestD1Database();
    db.shouldFailPrepare = true;

    const result = await hasActiveMatchWindow(db, baseTime);
    expect(result.hasActiveMatches).toBe(false);
    expect(result.activeMatchCount).toBe(0);
  });
});
